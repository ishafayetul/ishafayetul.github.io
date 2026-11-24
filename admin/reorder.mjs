export function moveItem(items, from, to) {
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < items.length) || from === to) return false;
  items.splice(to, 0, items.splice(from, 1)[0]);
  return true;
}

export function markdownSections(value) {
  const lines = value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const starts = [];
  let fence;
  for (const [index, line] of lines.entries()) {
    const marker = line.trimEnd().match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    if (/^ {0,3}##[ \t]+\S/.test(line)) starts.push(index);
  }
  return {
    prefix: lines.slice(0, starts[0] ?? lines.length).join(""),
    blocks: starts.map((index, i) => ({
      title: lines[index].trim().replace(/^##\s+/, ""),
      text: lines.slice(index, starts[i + 1] ?? lines.length).join("")
    }))
  };
}
