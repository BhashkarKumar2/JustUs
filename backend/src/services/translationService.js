/**
 * Translation Service with Caching and Multiple Providers
 * Reduces dependency on single API by implementing caching and fallbacks
 */

import geminiService from './geminiService.js';
import crypto from 'crypto';
import axios from 'axios';

class TranslationService {
  constructor() {
    this.cache = new Map(); // In-memory cache (could use Redis in production)
    this.cacheMaxSize = 1000; // Maximum cached translations
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Generate cache key from text and language pair
   */
  getCacheKey(text, fromLang, toLang) {
    const normalized = text.trim().toLowerCase();
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    return `${fromLang}:${toLang}:${hash}`;
  }

  /**
   * Get translation from cache
   */
  getFromCache(text, fromLang, toLang) {
    const key = this.getCacheKey(text, fromLang, toLang);
    const cached = this.cache.get(key);
    
    if (cached) {
      this.cacheHits++;
      console.log(`[Translation] Cache HIT (${this.cacheHits}/${this.cacheHits + this.cacheMisses})`);
      return cached;
    }
    
    this.cacheMisses++;
    return null;
  }

  /**
   * Store translation in cache
   */
  storeInCache(text, fromLang, toLang, translation) {
    const key = this.getCacheKey(text, fromLang, toLang);
    
    // Implement LRU-style eviction if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, translation);
  }

  /**
   * Translate using MyMemory API (free fallback)
   * Free tier: 1000 words/day
   */
  async translateWithMyMemory(text, fromLang, toLang) {
    try {
      console.log('[Translation] Trying MyMemory API...');
      
      const langMap = {
        'hi': 'hi-IN',
        'pa': 'pa-IN',
        'ta': 'ta-IN',
        'te': 'te-IN',
        'bn': 'bn-IN',
        'mr': 'mr-IN',
        'gu': 'gu-IN',
        'kn': 'kn-IN',
        'ml': 'ml-IN',
        'ur': 'ur-IN',
        'en': 'en-US'
      };

      const from = langMap[fromLang] || fromLang;
      const to = langMap[toLang] || toLang;
      
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
      
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data.responseStatus === 200 && response.data.responseData?.translatedText) {
        console.log('[Translation] MyMemory API success');
        return response.data.responseData.translatedText;
      }
      
      throw new Error('MyMemory API failed');
    } catch (error) {
      console.error('[Translation] MyMemory API error:', error.message);
      return null;
    }
  }

  /**
   * Translate using LibreTranslate (can self-host)
   * Using argos public instance (more reliable than libretranslate.com)
   */
  async translateWithLibreTranslate(text, fromLang, toLang) {
    try {
      console.log('[Translation] Trying LibreTranslate API...');
      
      const url = 'https://translate.argosopentech.com/translate';
      const response = await axios.post(url, {
        q: text,
        source: fromLang === 'auto' ? 'en' : fromLang,
        target: toLang,
        format: 'text'
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (response.data.translatedText) {
        console.log('[Translation] LibreTranslate API success');
        return response.data.translatedText;
      }
      
      throw new Error('LibreTranslate API failed');
    } catch (error) {
      console.error('[Translation] LibreTranslate API error:', error.message);
      return null;
    }
  }

  /**
   * Main translation method with caching and fallbacks
   * Provider order optimized based on performance testing:
   * 1. Cache (5ms)
   * 2. LibreTranslate (300-500ms, good reliability)
   * 3. MyMemory (300-600ms, free tier 1000 words/day)
   * 4. Gemini (800-2000ms, quota limits, last resort)
   */
  async translate(text, fromLang = 'auto', toLang = 'en') {
    if (!text || text.trim().length === 0) {
      return text;
    }

    // Same language, no translation needed
    if (fromLang === toLang && fromLang !== 'auto') {
      return text;
    }

    console.log(`[Translation] Request: ${fromLang} -> ${toLang}`);

    // 1. Check cache first (5ms - fastest)
    const cached = this.getFromCache(text, fromLang, toLang);
    if (cached) {
      return cached;
    }

    let translation = null;

    // 2. Try LibreTranslate first (300-500ms, most reliable free API)
    translation = await this.translateWithLibreTranslate(text, fromLang, toLang);
    if (translation) {
      this.storeInCache(text, fromLang, toLang, translation);
      return translation;
    }

    // 3. Try MyMemory (300-600ms, good fallback)
    translation = await this.translateWithMyMemory(text, fromLang, toLang);
    if (translation) {
      this.storeInCache(text, fromLang, toLang, translation);
      return translation;
    }

    // 4. Try Gemini as last resort (800-2000ms, quota limits)
    try {
      translation = await geminiService.translateText(text, fromLang, toLang);
      
      // Validate translation (check if it actually translated)
      if (translation && translation !== text && translation.length > 0) {
        console.log('[Translation] Gemini API success (fallback)');
        this.storeInCache(text, fromLang, toLang, translation);
        return translation;
      }
    } catch (error) {
      console.warn('[Translation] Gemini API failed:', error.message);
    }

    // 5. All failed, return original
    console.warn('[Translation] All translation APIs failed, returning original text');
    return text;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(2) : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: `${hitRate}%`
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    console.log('[Translation] Cache cleared');
  }
}

export default new TranslationService();
