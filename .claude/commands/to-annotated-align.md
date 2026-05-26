---
description: Convert a $$\begin{align}...\end{align}$$ block into an <AnnotatedAlign> component
---

Convert the selected `$$\begin{align}...\end{align}$$` block into an `<AnnotatedAlign>` component.

## Conversion rules

**Row splitting:** each `\\`-terminated line becomes one object in the `rows` array. Drop the trailing `\\`.

**Column mapping:** keep `&` characters as-is in the `math` string — the component splits on them to create grid cells. `&&` (double ampersand) produces an empty middle cell, just like in LaTeX's `align`.

**Labels:** `{#eq:foo}` in a row → remove from `math`, add `id: "eq:foo"` to that row object. The remark plugin injects the equation number automatically.

**Annotations:** if the original has no annotation, omit the `annotation` field entirely.

**Import:** if `AnnotatedAlign` is not already in the file's import line, add it.

## Example

Input:
```
$$
\begin{align}
    \max && 2x_a + 2.75x_o {#eq:obj}\\
    \st  && 150x_a & \leq 4000 \\
         && x_a    & \geq 0
\end{align}
$$
```

Output:
```jsx
<AnnotatedAlign
  rows={[
    { math: "\\max && 2x_a + 2.75x_o", id: "eq:obj" },
    { math: "\\st  && 150x_a & \\leq 4000" },
    { math: "     && x_a    & \\geq 0" },
  ]}
/>
```

Now perform this conversion on the selected text. It may appear above as a system-provided context block, or inline below:

$SELECTION
