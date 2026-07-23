"use client";

import { useEffect, useRef } from "react";
import { useProfile, useUpdateProfile } from "@/lib/client/hooks";

/**
 * Silently keeps the user's saved timezone in sync with the browser's, so the
 * journal's "now" is always correct without ever asking. Runs once per load
 * when the detected zone differs from the stored one. Renders nothing.
 */
export function TimezoneSync() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const done = useRef(false);

  useEffect(() => {
    if (!profile || done.current) return;
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (tz && tz !== profile.timezone) {
      done.current = true;
      update.mutate({ timezone: tz });
    }
  }, [profile, update]);

  return null;
}
