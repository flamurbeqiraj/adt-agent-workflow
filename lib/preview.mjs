// ADT's generated SCORM 1.2 adapter assumes every ancestor is same-origin.
// Inside Studio, its parent is deliberately isolated. Exit LMS discovery at
// that boundary, as it already does in a standalone reader. Never modify the
// stored or exported script, and never supply a pretend LMS API.
export function preparePreviewScript(name,buffer){
  if(!/(?:^|\/)scorm\.js$/i.test(name))return buffer;
  const source=buffer.toString('utf8');
  return Buffer.from(source.replace(/if\s*\(win\.API\)\s*return win\.API;/g,'try { if (win.API) return win.API; } catch (crossOriginParent) { return null; }'));
}
export const previewCompatibilityNote='The preview guards cross-origin parent lookup in the known ADT SCORM adapter. Stored and exported scripts are unchanged. LMS integration requires its own test.';
