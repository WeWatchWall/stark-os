/**
 * Volume validation
 * @module @stark-o/shared/validation/volume-validation
 */

import type { ValidationResult, ValidationError } from './pack-validation';

/**
 * Volume name pattern (DNS-like: lowercase, alphanumeric, hyphens)
 */
const VOLUME_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Maximum volume name length
 */
const MAX_VOLUME_NAME_LENGTH = 63;

/**
 * Maximum volume mounts per pod/service
 */
const MAX_VOLUME_MOUNTS = 20;

/**
 * Mount path pattern (must be absolute)
 */
const MOUNT_PATH_PATTERN = /^\/[a-zA-Z0-9_./-]+$/;

/**
 * UUID pattern for IDs
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate volume name
 */
export function validateVolumeName(name: unknown): ValidationError | null {
  if (name === undefined || name === null) {
    return {
      field: 'name',
      message: 'Volume name is required',
      code: 'REQUIRED',
    };
  }

  if (typeof name !== 'string') {
    return {
      field: 'name',
      message: 'Volume name must be a string',
      code: 'INVALID_TYPE',
    };
  }

  if (name.length === 0) {
    return {
      field: 'name',
      message: 'Volume name cannot be empty',
      code: 'INVALID_LENGTH',
    };
  }

  if (name.length > MAX_VOLUME_NAME_LENGTH) {
    return {
      field: 'name',
      message: `Volume name cannot exceed ${MAX_VOLUME_NAME_LENGTH} characters`,
      code: 'INVALID_LENGTH',
    };
  }

  if (!VOLUME_NAME_PATTERN.test(name)) {
    return {
      field: 'name',
      message: 'Volume name must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric',
      code: 'INVALID_FORMAT',
    };
  }

  return null;
}

/**
 * Validate a single volume mount
 */
export function validateVolumeMount(mount: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const fieldPrefix = `volumeMounts[${index}]`;

  if (typeof mount !== 'object' || mount === null || Array.isArray(mount)) {
    errors.push({
      field: fieldPrefix,
      message: 'Volume mount must be an object',
      code: 'INVALID_TYPE',
    });
    return errors;
  }

  const m = mount as Record<string, unknown>;

  // name is required
  if (m.name === undefined || m.name === null) {
    errors.push({
      field: `${fieldPrefix}.name`,
      message: 'Volume mount name is required',
      code: 'REQUIRED',
    });
  } else if (typeof m.name !== 'string') {
    errors.push({
      field: `${fieldPrefix}.name`,
      message: 'Volume mount name must be a string',
      code: 'INVALID_TYPE',
    });
  } else if (!VOLUME_NAME_PATTERN.test(m.name)) {
    errors.push({
      field: `${fieldPrefix}.name`,
      message: 'Volume mount name must be lowercase alphanumeric with hyphens',
      code: 'INVALID_FORMAT',
    });
  }

  // mountPath is required
  if (m.mountPath === undefined || m.mountPath === null) {
    errors.push({
      field: `${fieldPrefix}.mountPath`,
      message: 'Volume mount path is required',
      code: 'REQUIRED',
    });
  } else if (typeof m.mountPath !== 'string') {
    errors.push({
      field: `${fieldPrefix}.mountPath`,
      message: 'Volume mount path must be a string',
      code: 'INVALID_TYPE',
    });
  } else if (!MOUNT_PATH_PATTERN.test(m.mountPath)) {
    errors.push({
      field: `${fieldPrefix}.mountPath`,
      message: 'Volume mount path must be an absolute path',
      code: 'INVALID_FORMAT',
    });
  }

  return errors;
}

/**
 * Validate volume mounts array
 */
export function validateVolumeMounts(mounts: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (mounts === undefined || mounts === null) {
    return errors; // Optional field
  }

  if (!Array.isArray(mounts)) {
    errors.push({
      field: 'volumeMounts',
      message: 'Volume mounts must be an array',
      code: 'INVALID_TYPE',
    });
    return errors;
  }

  if (mounts.length > MAX_VOLUME_MOUNTS) {
    errors.push({
      field: 'volumeMounts',
      message: `Volume mounts cannot have more than ${MAX_VOLUME_MOUNTS} entries`,
      code: 'TOO_MANY_ENTRIES',
    });
    return errors;
  }

  // Check for duplicate mount paths
  const mountPaths = new Set<string>();

  for (let i = 0; i < mounts.length; i++) {
    errors.push(...validateVolumeMount(mounts[i], i));

    const mount = mounts[i] as Record<string, unknown>;
    if (typeof mount?.mountPath === 'string') {
      if (mountPaths.has(mount.mountPath)) {
        errors.push({
          field: `volumeMounts[${i}].mountPath`,
          message: `Duplicate mount path: ${mount.mountPath}`,
          code: 'DUPLICATE',
        });
      }
      mountPaths.add(mount.mountPath);
    }
  }

  return errors;
}

/**
 * Validate create volume input
 */
export function validateCreateVolumeInput(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'input', message: 'Input must be an object', code: 'INVALID_TYPE' }],
    };
  }

  const data = input as Record<string, unknown>;

  // Required: name
  const nameError = validateVolumeName(data.name);
  if (nameError) errors.push(nameError);

  // Required: nodeId
  if (data.nodeId === undefined || data.nodeId === null) {
    errors.push({
      field: 'nodeId',
      message: 'Node ID is required',
      code: 'REQUIRED',
    });
  } else if (typeof data.nodeId !== 'string') {
    errors.push({
      field: 'nodeId',
      message: 'Node ID must be a string',
      code: 'INVALID_TYPE',
    });
  } else if (!UUID_PATTERN.test(data.nodeId)) {
    errors.push({
      field: 'nodeId',
      message: 'Node ID must be a valid UUID',
      code: 'INVALID_FORMAT',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
