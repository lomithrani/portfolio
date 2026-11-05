import { EXPERIENCE_LIMITS } from 'portfolio-common';

// Experience logos are stored as data URLs (at most EXPERIENCE_LIMITS.icon characters).
// Raster images are downscaled in the browser and re-encoded; SVG and ICO files are kept as
// they are when they fit, and rasterized otherwise.

/** Longest side of a resized logo, in pixels */
export const ICON_SIZE = 128;

/** Larger files are refused before decoding */
export const MAX_ICON_FILE_BYTES = 10 * 1024 * 1024;

export const ICON_ACCEPT =
	'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.webp,.svg,.ico';

type IconKind = { kind: 'raster' | 'svg' | 'ico'; type: string };

const BY_TYPE: Record<string, IconKind> = {
	'image/png': { kind: 'raster', type: 'image/png' },
	'image/jpeg': { kind: 'raster', type: 'image/jpeg' },
	'image/webp': { kind: 'raster', type: 'image/webp' },
	'image/svg+xml': { kind: 'svg', type: 'image/svg+xml' },
	'image/x-icon': { kind: 'ico', type: 'image/x-icon' },
	'image/vnd.microsoft.icon': { kind: 'ico', type: 'image/x-icon' }
};

const BY_EXTENSION: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	ico: 'image/x-icon'
};

/** How a file is handled, from its type or (when the browser gives none) its extension */
export function iconKind(file: { type: string; name: string }): IconKind | undefined {
	const byType = BY_TYPE[file.type.toLowerCase()];
	if (byType) return byType;
	if (file.type) return undefined;
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	const type = BY_EXTENSION[extension];
	return type ? BY_TYPE[type] : undefined;
}

/** Size that fits in a max × max square, keeping the ratio, never upscaling */
export function fitWithin(
	width: number,
	height: number,
	max: number = ICON_SIZE
): { width: number; height: number } {
	if (!(width > 0) || !(height > 0)) return { width: max, height: max };
	const scale = Math.min(1, max / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

export const iconFits = (dataUrl: string): boolean => dataUrl.length <= EXPERIENCE_LIMITS.icon;

export type IconResult = { icon: string } | { error: string };

const readAsDataUrl = (blob: Blob) =>
	new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});

const loadImage = (blob: Blob) =>
	new Promise<HTMLImageElement>((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Unreadable image'));
		};
		image.src = url;
	});

/** The smallest acceptable encoding of the image: WebP, else PNG, at decreasing sizes */
function rasterize(image: HTMLImageElement): string | undefined {
	for (const max of [ICON_SIZE, 96, 64]) {
		const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, max);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return undefined;
		context.imageSmoothingQuality = 'high';
		context.drawImage(image, 0, 0, width, height);
		const encodings: [string, number | undefined][] = [
			['image/webp', 0.9],
			['image/webp', 0.75],
			['image/png', undefined]
		];
		for (const [type, quality] of encodings) {
			const url = canvas.toDataURL(type, quality);
			// Browsers without a WebP encoder answer PNG: the PNG attempt covers them
			if (url.startsWith(`data:${type}`) && iconFits(url)) return url;
		}
	}
	return undefined;
}

/** Reads a picked or dropped file into a logo data URL */
export async function readIcon(file: File): Promise<IconResult> {
	const kind = iconKind(file);
	if (!kind) return { error: 'Use a PNG, JPEG, WebP, SVG or ICO image.' };
	if (file.size > MAX_ICON_FILE_BYTES) return { error: 'Choose an image under 10 MB.' };

	// A file the browser gave no type would become an application/octet-stream data URL
	const blob = file.type ? file : new Blob([file], { type: kind.type });
	try {
		const original = await readAsDataUrl(blob);
		if (kind.kind !== 'raster' && iconFits(original)) return { icon: original };

		const image = await loadImage(blob);
		const small = image.naturalWidth <= ICON_SIZE && image.naturalHeight <= ICON_SIZE;
		if (kind.kind === 'raster' && small && image.naturalWidth > 0 && iconFits(original)) {
			return { icon: original };
		}
		const icon = rasterize(image);
		return icon ? { icon } : { error: 'This image is too detailed to fit. Try a simpler one.' };
	} catch {
		return { error: 'This image could not be read. Try another file.' };
	}
}
