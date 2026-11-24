# Playground

A single static page for building Shaqsiyad queries: pick an endpoint, set filters, watch the request URL update, run it, and copy it as curl, JavaScript, Python, CLI or Go. Persona results show as a grid of faces above the raw JSON.

The form state lives in the URL hash, so a link reproduces the exact query.

## Run it

It's plain HTML plus one ES module, with no build step. Modules don't load from `file://`, so serve the folder:

```sh
python3 -m http.server -d playground 8080   # then open http://localhost:8080
```

Point **Base URL** at another server (say `http://localhost:8000/api/v1`) to try a local API. That server must allow cross-origin requests from the page.

## Files

| | |
|---|---|
| `index.html` | The page: form, URL, code tabs, results. Light and dark, phone-width friendly. |
| `codegen.js` | Builds the request URL and every code snippet from the form state. No DOM, so it's testable. |
| `codegen.test.js` | Tests: `node --test playground/*.test.js` |
