import { cn } from "@/lib/utils";
import type { CompanionId } from "@/lib/companion";

interface CompanionAvatarProps {
  id: CompanionId;
  className?: string;
  /** Pass a name to expose the image to assistive tech; otherwise decorative. */
  label?: string;
}

/**
 * Original companion artwork.
 *
 * Deliberately simple geometry: it has to read at 16px in the sidebar and at
 * 56px while running, without external assets or a sprite sheet.
 */
export function CompanionAvatar({ id, className, label }: CompanionAvatarProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-6", className)}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      {label ? <title>{label}</title> : null}
      {id === "fox" && <Fox />}
      {id === "cat" && <Cat />}
      {id === "owl" && <Owl />}
      {id === "moss" && <Moss />}
    </svg>
  );
}

function Eyes({ y = 24, spread = 6 }: { y?: number; spread?: number }) {
  return (
    <>
      <circle cx={24 - spread} cy={y} r="1.7" fill="#2b2620" />
      <circle cx={24 + spread} cy={y} r="1.7" fill="#2b2620" />
      <circle cx={24 - spread + 0.6} cy={y - 0.6} r="0.5" fill="#fffaf0" />
      <circle cx={24 + spread + 0.6} cy={y - 0.6} r="0.5" fill="#fffaf0" />
    </>
  );
}

function Fox() {
  return (
    <>
      <path d="M10 14 8 4l10 7Z" fill="#c2540a" />
      <path d="M38 14 40 4 30 11Z" fill="#c2540a" />
      <path d="M10 14 8 4l7 5Z" fill="#f2b279" />
      <path d="M38 14 40 4l-7 5Z" fill="#f2b279" />
      <circle cx="24" cy="25" r="15" fill="#e07a33" />
      <path d="M24 39c-5 0-9-3-9-7 0-3 3-5 9-5s9 2 9 5c0 4-4 7-9 7Z" fill="#faf3e5" />
      <Eyes y={23} />
      <ellipse cx="24" cy="33" rx="2.2" ry="1.6" fill="#2b2620" />
      <path d="M20 35c1.5 1.4 6.5 1.4 8 0" stroke="#2b2620" strokeWidth="1" fill="none" strokeLinecap="round" />
    </>
  );
}

function Cat() {
  return (
    <>
      <path d="M11 16 9 5l10 6Z" fill="#8a8172" />
      <path d="M37 16 39 5 29 11Z" fill="#8a8172" />
      <path d="M11 16 9 5l6 4Z" fill="#d8b4a0" />
      <path d="M37 16 39 5l-6 4Z" fill="#d8b4a0" />
      <circle cx="24" cy="26" r="14" fill="#a99f90" />
      <path d="M12 27h7M29 27h7M12 31h6M30 31h6" stroke="#f6efe3" strokeWidth="1" strokeLinecap="round" />
      <Eyes y={24} />
      <path d="m24 30-1.6 1.6h3.2Z" fill="#2b2620" />
      <path d="M22 34c1 .8 3 .8 4 0" stroke="#2b2620" strokeWidth="1" fill="none" strokeLinecap="round" />
    </>
  );
}

function Owl() {
  return (
    <>
      <path d="M12 16 10 7l8 5Z" fill="#4f7a6a" />
      <path d="M36 16 38 7l-8 5Z" fill="#4f7a6a" />
      <circle cx="24" cy="25" r="15" fill="#6b9a86" />
      <circle cx="18" cy="23" r="5" fill="#f6efe3" />
      <circle cx="30" cy="23" r="5" fill="#f6efe3" />
      <circle cx="18" cy="23" r="2" fill="#2b2620" />
      <circle cx="30" cy="23" r="2" fill="#2b2620" />
      <path d="m24 27-2.4 3h4.8Z" fill="#e0a43a" />
      <path d="M17 35c4 2.6 10 2.6 14 0" stroke="#f6efe3" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  );
}

function Moss() {
  return (
    <>
      <path d="M24 6c2 0 3 1.6 3 3.2 0 1.4-1 2.6-2.2 3 6.6 1.4 11.2 6.6 11.2 13.3C36 33.5 30.6 39 24 39S12 33.5 12 25.5c0-6.7 4.6-11.9 11.2-13.3C22 11.8 21 10.6 21 9.2 21 7.6 22 6 24 6Z" fill="#5f8f5a" />
      <circle cx="19" cy="25" r="4.2" fill="#f6efe3" />
      <circle cx="29" cy="25" r="4.2" fill="#f6efe3" />
      <circle cx="19" cy="25" r="1.8" fill="#2b2620" />
      <circle cx="29" cy="25" r="1.8" fill="#2b2620" />
      <path d="M21 32c1.8 1.2 4.2 1.2 6 0" stroke="#2b2620" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <circle cx="15" cy="30" r="1.4" fill="#7fae74" />
      <circle cx="33" cy="31" r="1.8" fill="#7fae74" />
    </>
  );
}
