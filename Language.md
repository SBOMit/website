# Kubernetes-style language switcher

This package includes:

- `plain-html-language-switcher.html` — drop-in demo for plain HTML/CSS/JS
- `react-language-switcher.jsx` — reusable React component with CSS string export

## Why this matches the Kubernetes pattern

Kubernetes documents localization with language-specific codes such as `ko` and `pt-br`, and its language selection bar uses the configured `languageName`, with guidance to show native-script and English-script names together when helpful. [web:16][web:31]

## Plain HTML

Copy the `.k8s-lang-switcher` markup, styles, and script into your page. Update the `locales` array and either:

- provide explicit `path` values for each locale, or
- let the helper rebuild the current URL by swapping only the locale prefix

## React

Import the component and CSS:

```jsx
import KubernetesLanguageSwitcher, {
  defaultLocales,
  kubernetesLanguageSwitcherCss
} from './react-language-switcher';
```

Then render it:

```jsx
<KubernetesLanguageSwitcher
  locales={defaultLocales}
  currentLocale="en"
  currentPath="/en/docs/getting-started/"
  onNavigate={({href}) => {
    window.location.href = href;
  }}
/>
```

Inject the CSS once at app level:

```jsx
<style>{kubernetesLanguageSwitcherCss}</style>
```

## Notes

- Uses native language names like `Español`, `한국어`, and `Português (Brasil)` in the menu, which aligns with Kubernetes localization guidance. [web:16][web:31]
- Preserves the current route when switching languages by replacing only the locale prefix.
- Falls back to the locale homepage if a translated page is unavailable.
- Includes `lang`, `hreflang`, `aria-haspopup`, and `aria-current` attributes for accessibility and multilingual SEO support. [web:16]
