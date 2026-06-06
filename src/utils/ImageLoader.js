/**
 * ImageLoader Utility
 *
 * Handles loading and caching puzzle images
 */

export class ImageLoader {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Load an image from URL
     * @param {string} url - Image URL
     * @returns {Promise<HTMLImageElement>} Loaded image
     */
    async loadImage(url, crossOrigin = 'anonymous') {
        // Check cache first
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                this.cache.set(url, img);
                resolve(img);
            };

            img.onerror = () => {
                reject(new Error(`Failed to load image: ${url}`));
            };

            if (crossOrigin !== null) {
                img.crossOrigin = crossOrigin;
            }
            img.src = url;
        });
    }

    /**
     * Load image as ImageBitmap for better performance
     * @param {string} url - Image URL
     * @returns {Promise<ImageBitmap>} Image bitmap
     */
    async loadImageBitmap(url) {
        const img = await this.loadImage(url);

        if ('createImageBitmap' in window) {
            return createImageBitmap(img);
        }

        // Fallback to regular image
        return img;
    }

    /**
     * Preload multiple images
     * @param {Array<string>} urls - Array of image URLs
     * @returns {Promise<Array>} Array of loaded images
     */
    async preloadImages(urls) {
        const promises = urls.map(url => this.loadImage(url));
        return Promise.all(promises);
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get image dimensions
     * @param {string} url - Image URL
     * @returns {Promise<{width: number, height: number}>}
     */
    async getImageDimensions(url) {
        const img = await this.loadImage(url);
        return {
            width: img.naturalWidth,
            height: img.naturalHeight
        };
    }
}
