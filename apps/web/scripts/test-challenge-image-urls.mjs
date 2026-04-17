#!/usr/bin/env node

const DEFAULT_ENDPOINT =
  process.env.LATCHA_CHALLENGE_ENDPOINT ||
  "https://latcha.dev/api/latcha/challenge";
const DEFAULT_RUNS = Number.parseInt(
  process.env.LATCHA_CHALLENGE_RUNS || "1",
  10,
);

function parseArgs(argv) {
  let endpoint = DEFAULT_ENDPOINT;
  let runs = Number.isFinite(DEFAULT_RUNS) && DEFAULT_RUNS > 0 ? DEFAULT_RUNS : 1;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--endpoint" || arg === "-e") && argv[i + 1]) {
      endpoint = argv[++i];
    } else if ((arg === "--runs" || arg === "-n") && argv[i + 1]) {
      const value = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(value) && value > 0) {
        runs = value;
      }
    }
  }

  return { endpoint, runs };
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isDataImageUrl(url) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(url);
}

function validateDataImageUrl(url) {
  if (!isDataImageUrl(url)) {
    return {
      ok: false,
      type: "data-url",
      status: "INVALID_DATA_URL",
      detail: "URL is not a valid data:image/*;base64 payload",
    };
  }

  const commaIndex = url.indexOf(",");
  if (commaIndex < 0 || commaIndex === url.length - 1) {
    return {
      ok: false,
      type: "data-url",
      status: "EMPTY_DATA",
      detail: "Data URL has no payload",
    };
  }

  const base64 = url.slice(commaIndex + 1);
  try {
    const decoded = Buffer.from(base64, "base64");
    if (!decoded.length) {
      return {
        ok: false,
        type: "data-url",
        status: "EMPTY_DATA",
        detail: "Decoded payload is empty",
      };
    }

    return {
      ok: true,
      type: "data-url",
      status: "DATA_OK",
      detail: `decoded_bytes=${decoded.length}`,
    };
  } catch (error) {
    return {
      ok: false,
      type: "data-url",
      status: "DECODE_FAILED",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateHttpImageUrl(url) {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow",
    });

    if (head.ok) {
      return {
        ok: true,
        type: "http-url",
        status: String(head.status),
        detail: "HEAD",
      };
    }

    if (head.status === 405 || head.status === 400) {
      const get = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
      });

      return {
        ok: get.ok,
        type: "http-url",
        status: String(get.status),
        detail: "GET (HEAD unsupported)",
      };
    }

    return {
      ok: false,
      type: "http-url",
      status: String(head.status),
      detail: "HEAD",
    };
  } catch (error) {
    return {
      ok: false,
      type: "http-url",
      status: "EXCEPTION",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function validateImageUrl(url) {
  if (typeof url !== "string" || !url.length) {
    return {
      ok: false,
      type: "invalid",
      status: "EMPTY_OR_NON_STRING",
      detail: "URL must be a non-empty string",
    };
  }

  if (isDataImageUrl(url)) {
    return validateDataImageUrl(url);
  }

  if (isHttpUrl(url)) {
    return validateHttpImageUrl(url);
  }

  return {
    ok: false,
    type: "invalid",
    status: "BAD_FORMAT",
    detail: "URL is neither data:image/* nor http(s)",
  };
}

function formatUrlForLog(url) {
  if (typeof url !== "string") return String(url);
  if (url.length <= 180) return url;
  return `${url.slice(0, 120)}...[len=${url.length}]`;
}

async function fetchChallenge(endpoint) {
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
  };
}

async function main() {
  const { endpoint, runs } = parseArgs(process.argv.slice(2));

  console.log(`Testing challenge endpoint: ${endpoint}`);
  console.log(`Runs: ${runs}`);

  const failures = [];
  let totalUrlsChecked = 0;

  for (let runIndex = 1; runIndex <= runs; runIndex++) {
    const challenge = await fetchChallenge(endpoint);

    if (!challenge.ok || !challenge.payload) {
      failures.push({
        run: runIndex,
        imageIndex: null,
        reason: `Challenge request failed: status=${challenge.status}`,
        url: null,
      });
      console.log(
        `[run ${runIndex}] challenge_status=${challenge.status} challenge_fetch_ok=false`,
      );
      continue;
    }

    const challengeId = challenge.payload.challengeId ?? "n/a";
    const urls = Array.isArray(challenge.payload.gridImageUrls)
      ? challenge.payload.gridImageUrls
      : Array.isArray(challenge.payload.images)
        ? challenge.payload.images
        : [];

    console.log(
      `[run ${runIndex}] challenge_status=${challenge.status} challenge_fetch_ok=true challengeId=${challengeId} url_count=${urls.length}`,
    );

    if (urls.length !== 9) {
      failures.push({
        run: runIndex,
        imageIndex: null,
        reason: `Expected 9 image URLs but received ${urls.length}`,
        url: null,
      });
    }

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const result = await validateImageUrl(url);
      totalUrlsChecked++;

      console.log(
        `[run ${runIndex}] image=${i + 1}/9 ok=${result.ok} type=${result.type} status=${result.status} detail=${result.detail} url=${formatUrlForLog(url)}`,
      );

      if (!result.ok) {
        failures.push({
          run: runIndex,
          imageIndex: i + 1,
          reason: `${result.type}:${result.status}:${result.detail}`,
          url,
        });
      }
    }
  }

  console.log(`Checked image URLs: ${totalUrlsChecked}`);

  if (failures.length) {
    console.error(`\nFAIL: ${failures.length} issue(s) detected.`);
    for (const failure of failures) {
      console.error(
        `- run=${failure.run} image=${failure.imageIndex ?? "n/a"} reason=${failure.reason}${failure.url ? ` url=${failure.url}` : ""}`,
      );
    }
    process.exit(1);
  }

  console.log("\nPASS: all checked challenge image URLs were valid and reachable.");
}

main().catch((error) => {
  console.error("Unhandled test error:", error);
  process.exit(1);
});
