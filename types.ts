// FIX: Removed a circular self-import of `UploadedImage` which caused a conflict with its local declaration.

export interface UploadedImage {
  id: string;
  file: File;
  base64Src: string;
}

export interface Scene {
  id: string;
  imageSrc: string;
  script: string;
  audioSrc?: string;
  duration?: number;
}