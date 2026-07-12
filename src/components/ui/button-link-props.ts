import type { AnchorHTMLAttributes } from "react";

export type ButtonLinkAttributes = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export function buildButtonLinkProps(
  props: ButtonLinkAttributes,
  className: string,
): ButtonLinkAttributes {
  return {
    ...props,
    className,
    href: props.href,
  };
}
