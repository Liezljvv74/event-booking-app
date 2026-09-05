"use client";

/**
 * Writing the export to disk, and remembering where.
 *
 * There are two ways a browser lets a page save a file, and they are not the
 * same feature wearing different clothes.
 *
 * **The File System Access API** — Chrome and Edge on the desktop — lets the
 * person pick a folder once and hands back a handle to it. The handle can be
 * stored in IndexedDB and used again on a later visit, which is what makes
 * "save it to the same place as last time" possible at all. Permission does
 * not survive with it: a new session has to ask again, which is one click and
 * fits the way this app asks about the folder anyway.
 *
 * **A download** — everywhere else, Firefox, Safari, and every phone. The
 * file goes wherever that browser puts downloads. There is no folder to pick
 * and none to remember, so the screen does not offer the choice rather than
 * offering one that cannot be kept.
 *
 * The spec asks for the remembered folder on desktop and the browser's own
 * save on mobile; this is that, with the line drawn by what the browser can
 * do rather than by guessing at the size of the screen.
 */

import type { OutputFile } from "./data-transfer";

/**
 * The picker, which TypeScript's DOM library does not yet declare. Only the
 * one call is described, and only the part of it this app uses.
 */
interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
}

/**
 * Permission on a handle, which TypeScript does not declare either. Both
 * calls are on `FileSystemHandle` in the specification, so both are declared
 * there rather than on the directory alone.
 */
interface HandlePermissionOptions {
  mode?: "read" | "readwrite";
}

declare global {
  interface Window {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission?: (
      options?: HandlePermissionOptions,
    ) => Promise<PermissionState>;
    requestPermission?: (
      options?: HandlePermissionOptions,
    ) => Promise<PermissionState>;
  }
}

/** Whether this browser can hold on to a folder between exports. */
export function canRememberFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Ask for a folder. Null when the person closed the picker without choosing,
 * which is a decision rather than a failure and says nothing to the user.
 */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!canRememberFolder()) return null;

  try {
    // `id` asks the browser to reopen where this app was last pointed rather
    // than at whatever folder was last used by anything.
    return (await window.showDirectoryPicker!({
      id: "event-diary-exports",
      mode: "readwrite",
    })) satisfies FileSystemDirectoryHandle;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    throw error;
  }
}

/**
 * Whether the stored handle may still be written to, asking the person again
 * if the browser has forgotten.
 *
 * A handle kept from a previous session comes back valid but unpermitted, so
 * this must run before every write. The request has to happen inside the
 * click that started the export or the browser refuses it, which is why this
 * is called from the export path rather than when the screen loads.
 */
export async function ensureWritable(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const options = { mode: "readwrite" } as const;

  // Declared optional because the specification is not implemented
  // everywhere. A browser that hands out directory handles and then refuses
  // to say whether they may be written to does not exist, but the types
  // cannot know that, and a handle that cannot be asked is treated as usable
  // rather than as broken — the write itself will refuse if it is not.
  if (handle.queryPermission === undefined) return true;

  if ((await handle.queryPermission(options)) === "granted") return true;
  if (handle.requestPermission === undefined) return false;
  return (await handle.requestPermission(options)) === "granted";
}

/** Write the files into a folder already confirmed writable. */
export async function writeToFolder(
  handle: FileSystemDirectoryHandle,
  files: readonly OutputFile[],
): Promise<void> {
  for (const file of files) {
    const target = await handle.getFileHandle(file.name, { create: true });
    const stream = await target.createWritable();
    await stream.write(new Blob([file.text], { type: file.type }));
    await stream.close();
  }
}

/**
 * Hand the files to the browser to save wherever it saves things.
 *
 * The object URL is revoked on a later turn of the event loop rather than
 * straight away: Firefox has been known to cancel a download whose URL is
 * revoked in the same tick as the click.
 */
export function downloadFiles(files: readonly OutputFile[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
