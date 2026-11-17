'use client';

/**
 * A <select> that submits its form the moment it changes (Tom, 17 Nov).
 *
 * A plain GET form still works without JavaScript -- the Search button
 * submits it -- this only removes the extra click when JS is there.
 */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
