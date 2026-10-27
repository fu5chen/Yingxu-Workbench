import { DEFAULT_MODEL, type ModelId } from "./validation.ts";
import { DEFAULT_IMAGE_MODEL, type ImageModel } from "./image-models.ts";

// Retain the full catalogs for existing generation records.
export const ACTIVE_VIDEO_MODELS: readonly ModelId[] = ["h3", DEFAULT_MODEL];
export const ACTIVE_IMAGE_MODELS: readonly ImageModel[] = ['krea2',DEFAULT_IMAGE_MODEL];
export function isActiveVideoModel(value: unknown): value is ModelId {
  return typeof value === "string" && (ACTIVE_VIDEO_MODELS as readonly string[]).includes(value);
}
export function isActiveImageModel(value: unknown): value is ImageModel {
  return typeof value === "string" && (ACTIVE_IMAGE_MODELS as readonly string[]).includes(value);
}
