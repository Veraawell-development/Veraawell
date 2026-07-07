const NodeCache = require('node-cache');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CACHE');

// Standard TTL of 5 minutes (300 seconds)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Get value from cache
 * @param {string} key 
 */
function get(key) {
    const value = cache.get(key);
    if (value) {
        logger.debug(`Cache HIT for key: ${key}`);
    } else {
        logger.debug(`Cache MISS for key: ${key}`);
    }
    return value;
}

/**
 * Set value in cache
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttl - Optional TTL in seconds
 */
function set(key, value, ttl = 300) {
    logger.debug(`Cache SET for key: ${key}`);
    return cache.set(key, value, ttl);
}

/**
 * Delete specific key from cache
 * @param {string} key 
 */
function del(key) {
    logger.debug(`Cache DEL for key: ${key}`);
    return cache.del(key);
}

/**
 * Clear all cache keys starting with a specific prefix
 * Useful for invalidating all article list pages at once
 * @param {string} prefix 
 */
function clearPrefix(prefix) {
    const keys = cache.keys();
    const keysToDelete = keys.filter(k => k.startsWith(prefix));
    
    if (keysToDelete.length > 0) {
        logger.debug(`Cache CLEAR prefix: ${prefix} (${keysToDelete.length} keys)`);
        cache.del(keysToDelete);
    }
}

/**
 * Clear entire cache
 */
function flush() {
    logger.debug('Cache FLUSHED completely');
    cache.flushAll();
}

module.exports = {
    get,
    set,
    del,
    clearPrefix,
    flush
};
