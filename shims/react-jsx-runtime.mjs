const R = window.React;
const mk = (spread) => (type, props, key) => {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  if (children === undefined) return R.createElement(type, rest);
  return spread && Array.isArray(children) ? R.createElement(type, rest, ...children) : R.createElement(type, rest, children);
};
export const jsx = mk(false), jsxs = mk(true), Fragment = R.Fragment;
