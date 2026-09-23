function resolveElement(definition, column, model) {
  if (definition.elements?.[column]) return definition.elements[column];

  for (const [associationName, association] of Object.entries(definition.elements || {})) {
    if (!association.target || !association.keys?.length) continue;
    const prefix = `${associationName}_`;
    if (!column.startsWith(prefix)) continue;
    const foreignKeyName = column.slice(prefix.length);
    const key = association.keys.find(candidate => {
      const generatedName = candidate.as || candidate.ref?.join("_");
      return generatedName === foreignKeyName;
    });
    if (!key) continue;
    const target = model?.definitions?.[association.target];
    let targetElement = target;
    for (const segment of key.ref || []) targetElement = targetElement?.elements?.[segment];
    return targetElement || { type: "cds.String" };
  }
  return null;
}

module.exports = { resolveElement };
