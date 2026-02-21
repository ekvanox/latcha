import { codeToHtml } from "shiki";

interface Props {
  code: string;
  lang?: string;
}

const latchaTheme = {
  name: "latcha",
  type: "light" as const,
  colors: {
    "editor.background": "#faf7f2",
    "editor.foreground": "#3d3028",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: "#9a9088", fontStyle: "italic" },
    },
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.operator.new",
        "keyword.other",
        "storage.type",
        "storage.modifier",
      ],
      settings: { foreground: "#3d5a1e" },
    },
    {
      scope: ["string", "string.quoted", "string.template", "string.interpolated"],
      settings: { foreground: "#7a4a28" },
    },
    {
      scope: ["entity.name.tag", "support.class.component", "meta.tag.sgml"],
      settings: { foreground: "#3d5a1e" },
    },
    {
      scope: ["entity.other.attribute-name", "entity.other.attribute-name.jsx"],
      settings: { foreground: "#5a7a2e" },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function"],
      settings: { foreground: "#2a5c42" },
    },
    {
      scope: ["entity.name.type", "entity.name.class", "support.class", "support.type"],
      settings: { foreground: "#4a5c3d" },
    },
    {
      scope: ["variable", "variable.other", "variable.other.readwrite"],
      settings: { foreground: "#4a3d35" },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.other"],
      settings: { foreground: "#8b5e3c" },
    },
    {
      scope: ["keyword.operator"],
      settings: { foreground: "#6b6560" },
    },
    {
      scope: ["punctuation", "meta.brace.round", "meta.brace.curly", "meta.brace.square"],
      settings: { foreground: "#7a7268" },
    },
  ],
};

export async function CodeBlock({ code, lang = "tsx" }: Props) {
  const html = await codeToHtml(code, {
    lang,
    theme: latchaTheme,
  });

  return (
    <div
      className="rounded-xl border border-[var(--card-border)] overflow-hidden text-sm font-mono [&>pre]:p-4 [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
