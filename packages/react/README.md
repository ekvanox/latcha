# @latcha/react

AI-proof CAPTCHA for React. Drop-in replacement for reCAPTCHA v2 — no signup, no API key, no backend needed.

<!-- Replace with an actual screenshot -->
![Latcha widget screenshot](https://latcha.dev/captcha.png)

---

## Install

```bash
npm install @latcha/react
# or
pnpm add @latcha/react
```

## Usage

```tsx
import { LatchaWidget } from "@latcha/react";

function ContactForm() {
  const [verified, setVerified] = useState(false);

  return (
    <form onSubmit={...}>
      <input name="email" type="email" />
      <textarea name="message" />

      <LatchaWidget onVerify={() => setVerified(true)} />

      <button type="submit" disabled={!verified}>Send</button>
    </form>
  );
}
```

## How it works

1. User clicks "I'm not a robot"
2. A 3×3 grid of AI-generated images loads — human faces are hidden inside some cells
3. User selects all cells with a face and clicks Verify
4. Answer is checked server-side. `onVerify` fires on success.

No cookies. No tracking. No account required.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onVerify` | `(token: string) => void` | — | Called on success |
| `onError` | `(err: Error) => void` | — | Called on network/API failure |
| `apiBase` | `string` | `"https://latcha.dev/api/latcha"` | Override to self-host |
| `theme` | `"light" \| "dark"` | `"light"` | Color scheme |

## Links

- [Live demo](https://latcha.dev/dashboard)
- [GitHub](https://github.com/ekvanox/lacha)


Made with ❤️ for HackEurope Stockholm
