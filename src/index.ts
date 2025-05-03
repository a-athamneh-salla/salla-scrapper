/**
 * Web Scraper for Cloudflare Workers
 * 
 * This worker extracts the following data from websites:
 * 1. Site name and metadata
 * 2. Site colors
 * 3. Social media links
 * 4. Important page content (usage agreement, privacy policy, return policies, etc.)
 */

import * as cheerio from 'cheerio';

// Interface for the extracted data
interface ScrapedData {
  url: string;
  metadata: {
    title?: string;
    description?: string;
    keywords?: string;
    author?: string;
    favicon?: string;
    ogTags?: Record<string, string>;
    twitterTags?: Record<string, string>;
  };
  colors: string[];
  socialMediaLinks: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    pinterest?: string;
    github?: string;
    other: Record<string, string>;
  };
  pageContent: {
    privacyPolicy?: {
      url?: string;
      content?: string;
    };
    termsOfService?: {
      url?: string;
      content?: string;
    };
    usageAgreement?: {
      url?: string;
      content?: string;
    };
    returnPolicy?: {
      url?: string;
      content?: string;
    };
    exchangePolicy?: {
      url?: string;
      content?: string;
    };
    other: Record<string, { url?: string; content?: string }>;
  };
  // Add tax information section to the interface
  taxInformation?: {
    taxNumber?: string;
    taxNumberValidated: boolean;
    taxRegistrationImage?: {
      url?: string;
      base64Data?: string;
      filename?: string;
      contentType?: string;
      metadata?: Record<string, any>;
    };
  };
}

// Regular expressions for social media URLs
const socialMediaPatterns = {
  facebook: /(?:https?:)?\/\/(?:www\.)?(?:facebook|fb)\.com\/[a-zA-Z0-9.]+/i,
  twitter: /(?:https?:)?\/\/(?:www\.)?twitter\.com\/[a-zA-Z0-9_]+/i,
  instagram: /(?:https?:)?\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/i,
  linkedin: /(?:https?:)?\/\/(?:www\.)?linkedin\.com\/(?:company\/[a-zA-Z0-9_.-]+|in\/[a-zA-Z0-9_.-]+)/i,
  youtube: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/(?:channel\/|user\/|c\/)?[a-zA-Z0-9_-]+/i,
  pinterest: /(?:https?:)?\/\/(?:www\.)?pinterest\.com\/[a-zA-Z0-9_]+/i,
  github: /(?:https?:)?\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i,
};

// Regular expressions for tax identification numbers
const taxNumberPatterns = {
  // Standard tax ID formats across various countries
  vatEU: /\b([A-Z]{2}[0-9A-Z]{6,12})\b/i,                    // EU VAT format (e.g., GB123456789)
  ein: /\b([0-9]{2}-[0-9]{7})\b/,                            // US EIN format (XX-XXXXXXX)
  ssn: /\b([0-9]{3}-[0-9]{2}-[0-9]{4})\b/,                   // SSN format (XXX-XX-XXXX)
  standardNumeric: /\b([0-9]{6,15})\b/,                      // Generic tax number (6-15 digits)
  hyphenated: /\b([0-9]{2,4}[-][0-9]{2,4}[-][0-9]{2,6})\b/,  // Hyphenated format (XX-XX-XXXX)
  // Labeled formats with explicit prefix
  labeled: /\b(?:Tax|VAT|GST|TRN|TIN|NIT|RUT|CNPJ)(?:\s+ID|\s+Number|\s+#)?[\s:]*([A-Z0-9][\dA-Z\s-]{5,20})\b/i,
  // Arabic pattern
  arabic: /الرقم\s+الضريبي\s*[:\uff1a]\s*([0-9][\d\s-]{5,}[0-9])/i,
};

// Regex for validating common tax ID formats
const taxNumberValidationPatterns = {
  // More strict patterns for validation after extraction
  vatEU: /^[A-Z]{2}[0-9A-Z]{6,12}$/i,
  numeric: /^[0-9]{6,15}$/,
  alphanumeric: /^[A-Z0-9]{6,15}$/i,
  hyphenated: /^[0-9]{2,4}[-][0-9]{2,4}[-][0-9]{2,6}$/
};

// Function to extract colors from CSS
function extractColorsFromCSS(css: string): string[] {
  // Match hex colors
  const hexColors = css.match(/#([a-fA-F0-9]{3}){1,2}\b/g) || [];
  
  // Match rgb/rgba colors
  const rgbColors = css.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g) || [];
  const rgbaColors = css.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:0?\.)?\d+\s*\)/g) || [];
  
  // Match named colors (common CSS color names)
  const namedColorPattern = /\b(black|silver|gray|white|maroon|red|purple|fuchsia|green|lime|olive|yellow|navy|blue|teal|aqua|orange|aliceblue|antiquewhite|aquamarine|azure|beige|bisque|blanchedalmond|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dodgerblue|firebrick|floralwhite|forestgreen|gainsboro|ghostwhite|gold|goldenrod|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightsteelblue|lightyellow|limegreen|linen|magenta|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|oldlace|olivedrab|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|skyblue|slateblue|slategray|snow|springgreen|steelblue|tan|thistle|tomato|turquoise|violet|wheat|whitesmoke|yellowgreen)\b(?!\-)/gi;
  const namedColors = css.match(namedColorPattern) || [];
  
  // Combine all colors and remove duplicates
  const allColors = [...new Set([...hexColors, ...rgbColors, ...rgbaColors, ...namedColors])];
  
  return allColors.slice(0, 10); // Limit to 10 colors
}

// Function to extract social media links
function extractSocialMediaLinks($: cheerio.CheerioAPI): {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  pinterest?: string;
  github?: string;
  other: Record<string, string>;
} {
  const socialLinks: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    pinterest?: string;
    github?: string;
    other: Record<string, string>;
  } = {
    other: {},
  };

  // Find links that match social media patterns
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    // Check if link matches any social media pattern
    for (const [platform, pattern] of Object.entries(socialMediaPatterns)) {
      if (pattern.test(href)) {
        if (platform === 'facebook' || platform === 'twitter' || platform === 'instagram' ||
            platform === 'linkedin' || platform === 'youtube' || platform === 'pinterest' ||
            platform === 'github') {
          socialLinks[platform] = href;
        }
        return; // Stop once we find a match
      }
    }

    // Check for other social media links by looking at common class names and text
    const classNames = $(element).attr('class') || '';
    const text = $(element).text().toLowerCase();
    
    if (
      classNames.includes('social') ||
      /(?:follow|share)/.test(classNames) ||
      element.attribs['aria-label']?.toLowerCase().includes('social') ||
      $(element).find('i[class*="fa-"]').length > 0 || // Font Awesome icons
      $(element).find('svg').length > 0 // SVG icons often used for social media
    ) {
      const url = new URL(href, 'https://example.com').href;
      const domain = url.replace(/https?:\/\/(?:www\.)?([^/]+).*/, '$1');
      if (!Object.values(socialLinks).includes(href)) {
        socialLinks.other[domain] = href;
      }
    }
  });

  return socialLinks;
}

// Function to fetch and extract content from a policy page
async function fetchPolicyContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return `Failed to fetch content: ${response.status} ${response.statusText}`;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, and other non-content elements
    $('script, style, nav, header, footer, iframe, noscript').remove();

    // Extract the main content (prefer standard content containers)
    let content = '';
    const mainContent = $('main, article, #content, .content, [role="main"], .main-content, .page-content').first();

    if (mainContent.length > 0) {
      content = mainContent.text().trim();
    } else {
      // If no main content container is found, extract from body, but try to be smart about it
      content = $('body').text().trim();
    }

    // Clean up the content (remove excessive whitespace)
    content = content.replace(/\s+/g, ' ').trim();
    
    // Limit content size (max 5000 chars)
    return content.length > 5000 ? content.substring(0, 5000) + '... (content truncated)' : content;
  } catch (error: any) {
    return `Error fetching content: ${error.message || 'Unknown error'}`;
  }
}

// Function to extract policy links
function extractPolicyPages($: cheerio.CheerioAPI, baseUrl: string): {
  privacyPolicy?: {
    url?: string;
    content?: string;
  };
  termsOfService?: {
    url?: string;
    content?: string;
  };
  usageAgreement?: {
    url?: string;
    content?: string;
  };
  returnPolicy?: {
    url?: string;
    content?: string;
  };
  exchangePolicy?: {
    url?: string;
    content?: string;
  };
  other: Record<string, { url?: string; content?: string }>;
} {
  const policies: {
    privacyPolicy?: {
      url?: string;
      content?: string;
    };
    termsOfService?: {
      url?: string;
      content?: string;
    };
    usageAgreement?: {
      url?: string;
      content?: string;
    };
    returnPolicy?: {
      url?: string;
      content?: string;
    };
    exchangePolicy?: {
      url?: string;
      content?: string;
    };
    other: Record<string, { url?: string; content?: string }>;
  } = {
    privacyPolicy: {},
    termsOfService: {},
    usageAgreement: {},
    returnPolicy: {},
    exchangePolicy: {},
    other: {},
  };

  // Search for common policy links in the footer and throughout the page
  $('footer a, .footer a, [class*="footer"] a, [id*="footer"] a, a[href*="privacy"], a[href*="terms"], a[href*="legal"], a[href*="policy"], a[href*="agreement"], a[href*="return"], a[href*="exchange"], a[href*="refund"]').each((_, element) => {
    const href = $(element).attr('href');
    const text = $(element).text().trim().toLowerCase();
    
    if (!href) return;

    const url = new URL(href, baseUrl).href;
    
    // Categorize based on URL and text content
    if (/privacy|personal-data|data-protection|privacidad/i.test(url) || /privacy|personal data|data protection/i.test(text)) {
      policies.privacyPolicy = { url };
    } else if (/terms|conditions|tos|terms-of-service|terminos/i.test(url) || /terms|conditions|tos/i.test(text)) {
      policies.termsOfService = { url };
    } else if (/agreement|usage|use|eula|license/i.test(url) || /agreement|usage|use policy/i.test(text)) {
      policies.usageAgreement = { url };
    } else if (/return|returns-?policy|devolucion/i.test(url) || /return|returns policy/i.test(text)) {
      policies.returnPolicy = { url };
    } else if (/exchange|refund|money-back|cambio/i.test(url) || /exchange|refund policy|money back/i.test(text)) {
      policies.exchangePolicy = { url };
    } else if (/legal|cookie|gdpr|ccpa|disclaimer/i.test(url) || /legal|cookie policy|gdpr|disclaimer/i.test(text)) {
      const key = text.replace(/[^a-z0-9]/g, '-');
      policies.other[key] = { url };
    }
  });

  return policies;
}

// Function to extract metadata
function extractMetadata($: cheerio.CheerioAPI, url: string): Record<string, any> {
  const metadata: Record<string, any> = {
    ogTags: {},
    twitterTags: {},
  };

  // Extract basic metadata
  metadata.title = $('title').first().text() || undefined;
  metadata.description = $('meta[name="description"]').attr('content') || undefined;
  metadata.keywords = $('meta[name="keywords"]').attr('content') || undefined;
  metadata.author = $('meta[name="author"]').attr('content') || undefined;
  
  // Extract favicon
  const faviconLink = $('link[rel="icon"], link[rel="shortcut icon"]').first().attr('href');
  if (faviconLink) {
    metadata.favicon = new URL(faviconLink, url).href;
  }

  // Extract Open Graph tags
  $('meta[property^="og:"]').each((_, element) => {
    const property = $(element).attr('property')?.replace('og:', '');
    const content = $(element).attr('content');
    if (property && content) {
      metadata.ogTags[property] = content;
    }
  });

  // Extract Twitter Card tags
  $('meta[name^="twitter:"]').each((_, element) => {
    const name = $(element).attr('name')?.replace('twitter:', '');
    const content = $(element).attr('content');
    if (name && content) {
      metadata.twitterTags[name] = content;
    }
  });

  return metadata;
}

/**
 * Function to extract tax information from a webpage
 * Implements multiple methods to find tax identification numbers and tax registration images
 * @param $ - Cheerio instance loaded with the webpage HTML
 * @param baseUrl - Base URL of the webpage for resolving relative URLs
 * @returns Object containing tax number and registration image information
 */
async function extractTaxInformation($: cheerio.CheerioAPI, baseUrl: string): Promise<{
  taxNumber?: string;
  taxNumberValidated: boolean;
  taxRegistrationImage?: {
    url?: string;
    base64Data?: string;
    filename?: string;
    contentType?: string;
    metadata?: Record<string, any>;
  };
}> {
  console.log("Starting tax information extraction for", baseUrl);

  const result = {
    taxNumber: undefined as string | undefined,
    taxNumberValidated: false,
    taxRegistrationImage: undefined as {
      url?: string;
      base64Data?: string;
      filename?: string;
      contentType?: string;
      metadata?: Record<string, any>;
    } | undefined
  };

  try {
    // UPDATED: Look specifically for Arabic tax number labels in various formats
    console.log("Searching for tax identification numbers...");
    
    // Method 1: Direct text search for the Arabic label followed by numbers
    const footerText = $('footer').text();
    let match = footerText.match(/الرقم الضريبي\s*[:\uff1a]?\s*(\d{15})/);
    if (match && match[1]) {
      result.taxNumber = match[1].trim();
      result.taxNumberValidated = true;
      console.log("Method 1: Found tax number in footer text:", result.taxNumber);
    }
    
    // Method 2: Look for elements containing the Arabic label
    if (!result.taxNumber) {
      $(':contains("الرقم الضريبي")').each(function() {
        const text = $(this).text().trim();
        const elementMatch = text.match(/الرقم الضريبي\s*[:\uff1a]?\s*(\d{15})/);
        if (elementMatch && elementMatch[1]) {
          result.taxNumber = elementMatch[1].trim();
          result.taxNumberValidated = true;
          console.log("Method 2: Found tax number in element:", result.taxNumber);
          return false; // Break the each loop
        }
      });
    }
    
    // Method 3: Look for specific structures in the footer where tax numbers are commonly placed
    if (!result.taxNumber) {
      // Try to find any 15-digit number in the footer
      const digits = footerText.match(/\b(\d{15})\b/);
      if (digits && digits[1]) {
        result.taxNumber = digits[1];
        result.taxNumberValidated = true;
        console.log("Method 3: Found 15-digit number in footer:", result.taxNumber);
      }
    }
    
    // Method 4: Look for elements with tax-related classes or IDs
    if (!result.taxNumber) {
      $('[id*="tax"],[id*="vat"],[class*="tax"],[class*="vat"]').each(function() {
        const text = $(this).text().trim();
        const numMatch = text.match(/\b(\d{15})\b/);
        if (numMatch && numMatch[1]) {
          result.taxNumber = numMatch[1];
          result.taxNumberValidated = true;
          console.log("Method 4: Found tax number in tax-related element:", result.taxNumber);
          return false;
        }
      });
    }
    
    // Method 5: Special case for Zyros.com structure
    if (!result.taxNumber && baseUrl.includes('zyros.com')) {
      $('.footer, [class*="footer"]').find(':contains("الرقم الضريبي")').each(function() {
        // Look at this element's text and the text of the next element
        const taxLabel = $(this).text().trim();
        const nextElement = $(this).next();
        if (nextElement.length > 0) {
          const nextText = nextElement.text().trim();
          const numMatch = nextText.match(/\b(\d{15})\b/);
          if (numMatch && numMatch[1]) {
            result.taxNumber = numMatch[1];
            result.taxNumberValidated = true;
            console.log("Method 5: Found tax number in Zyros.com structure:", result.taxNumber);
            return false;
          }
        }
      });
    }
    
    // EXISTING CODE FOR TAX REGISTRATION IMAGE EXTRACTION
    const taxImageSelectors = [
      // Images related to tax documents
      'img[src*="tax"][src*="cert"]', 'img[src*="vat"][src*="cert"]',
      'img[src*="tax-reg"]', 'img[src*="vat-reg"]',
      'img[alt*="tax"][alt*="cert"]', 'img[alt*="vat"][alt*="cert"]',
      'img[alt*="tax"][alt*="registration"]',
      // More general image selectors
      'img[src*="certificate"]', 'img[alt*="certificate"]',
      // Arabic selectors
      'img[alt*="شهادة"][alt*="ضريب"]',
      // Images within relevant links
      'a:contains("VAT Certificate") img', 'a:contains("Tax Certificate") img',
      'a:contains("شهادة ضريبية") img'
    ];
    
    // First look for images that are specifically tax certificates
    for (const selector of taxImageSelectors) {
      const images = $(selector);
      
      if (images.length > 0) {
        const img = images.first();
        const imgSrc = img.attr('src');
        const imgAlt = img.attr('alt') || 'tax-certificate';
        
        if (imgSrc) {
          // Convert to absolute URL
          const imageUrl = new URL(imgSrc, baseUrl).href;
          
          // Create a standardized filename
          const urlObj = new URL(imageUrl);
          const pathParts = urlObj.pathname.split('/');
          const originalFilename = pathParts[pathParts.length - 1];
          const fileExtension = originalFilename.split('.').pop() || 'jpg';
          
          const standardizedFilename = `tax_cert_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
          
          console.log("Found tax registration image:", imageUrl);
          
          try {
            // Add a delay before fetching the image to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const imageResponse = await fetch(imageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
              },
            });
            
            if (!imageResponse.ok) {
              console.error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
              continue;
            }
            
            // Verify the content type is an image
            const contentType = imageResponse.headers.get('content-type');
            if (!contentType || !contentType.startsWith('image/')) {
              console.error(`Not an image: ${contentType}`);
              continue;
            }
            
            // Process the image
            const imageBuffer = await imageResponse.arrayBuffer();
            
            // Extract some basic image metadata
            const metadata: Record<string, any> = {
              size: imageBuffer.byteLength,
              type: contentType,
              dateExtracted: new Date().toISOString()
            };
            
            // Get additional headers that might contain useful metadata
            const lastModified = imageResponse.headers.get('last-modified');
            if (lastModified) metadata.lastModified = lastModified;
            
            const etag = imageResponse.headers.get('etag');
            if (etag) metadata.etag = etag;
            
            // Convert image to base64
            const base64 = btoa(
              new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            
            // Set the result
            result.taxRegistrationImage = {
              url: imageUrl,
              base64Data: `data:${contentType};base64,${base64}`,
              filename: standardizedFilename,
              contentType,
              metadata
            };
            
            // Break after finding a valid image
            break;
          } catch (error) {
            console.error("Error processing tax registration image:", error);
          }
        }
      }
    }
    
    // If no image found, look for links to certificates
    if (!result.taxRegistrationImage) {
      const certLinkSelectors = [
        'a[href*="tax"][href*="cert"]', 'a[href*="vat"][href*="cert"]',
        'a[href*="tax-certificate"]', 'a:contains("Tax Certificate")',
        'a:contains("VAT Certificate")', 'a[href*="pdf"][href*="tax"]',
        'a:contains("الرقم الضريبي")'
      ];
      
      for (const selector of certLinkSelectors) {
        const links = $(selector);
        
        if (links.length > 0) {
          const link = links.first();
          const href = link.attr('href');
          
          if (href) {
            // Convert to absolute URL
            const certUrl = new URL(href, baseUrl).href;
            
            console.log("Found link to tax certificate:", certUrl);
            
            // Just store the URL, don't try to download non-image content
            result.taxRegistrationImage = {
              url: certUrl,
              filename: `tax_certificate_link.html`,
              contentType: 'text/html'
            };
            
            break;
          }
        }
      }
    }
  
  } catch (error) {
    console.error("Error in tax information extraction:", error);
  }

  return result;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight request for the API endpoint
    if (request.method === 'OPTIONS' && url.pathname === '/api/scrape') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*', // Adjust for production if needed
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Handle the main routes
    console.log('Request URL:', url.pathname);

    switch (url.pathname) {
      case '/api/scrape':
        // Get URL to scrape from query string
        const targetUrl = url.searchParams.get('url');
        const fetchContent = url.searchParams.get('fetchContent') === 'true';

        if (!targetUrl) {
          return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // Validate the input URL
        try {
          new URL(targetUrl);
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Invalid URL provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        try {
          // Initialize the data object
          const data: ScrapedData = {
            url: targetUrl,
            metadata: {},
            colors: [],
            socialMediaLinks: {
              other: {},
            },
            pageContent: {
              other: {},
            },
          };

          console.log(`Starting to scrape ${targetUrl}`);
          
          // Fetch the target website with proper headers and error handling
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }).catch(error => {
            console.error(`Network error fetching ${targetUrl}: ${error.message}`);
            throw new Error(`Network error: ${error.message}`);
          });

          // Check if the response is OK
          if (!response.ok) {
            console.error(`HTTP error: ${response.status} ${response.statusText}`);
            return new Response(JSON.stringify({ error: `Failed to fetch URL: ${response.status} ${response.statusText}` }), {
              status: 500,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          // Get HTML content and create Cheerio object
          const html = await response.text();
          const $ = cheerio.load(html);

          // Extract metadata
          data.metadata = extractMetadata($, targetUrl);
          console.log('Metadata extracted');

          // Extract site colors from stylesheets and inline styles
          let allCSS = '';
          $('style').each((_, element) => { allCSS += $(element).html() || ''; });
          $('[style]').each((_, element) => { allCSS += $(element).attr('style') || ''; });
          data.colors = extractColorsFromCSS(allCSS);
          console.log('Colors extracted');

          // Extract social media links
          data.socialMediaLinks = extractSocialMediaLinks($);
          console.log('Social media links extracted');

          // Extract policy pages
          data.pageContent = extractPolicyPages($, targetUrl);
          console.log('Policy pages extracted');

          // Extract tax information - added new functionality
          console.log('Starting tax information extraction');
          data.taxInformation = await extractTaxInformation($, targetUrl);
          console.log('Tax information extracted:', 
            data.taxInformation?.taxNumber ? `Found tax number: ${data.taxInformation.taxNumber}` : 'No tax number found',
            data.taxInformation?.taxRegistrationImage?.url ? `Found tax image: ${data.taxInformation.taxRegistrationImage.url}` : 'No tax image found'
          );

          // If fetchContent flag is true, fetch content for each policy page
          if (fetchContent) {
            const policyFetches = [];
            const processPolicy = async (policyType: keyof ScrapedData['pageContent']) => {
                const policyInfo = data.pageContent[policyType];
                if (policyInfo && typeof policyInfo === 'object' && 'url' in policyInfo && policyInfo.url) {
                    try {
                        const content = await fetchPolicyContent(policyInfo.url);
                        if (data.pageContent[policyType]) {
                            (data.pageContent[policyType] as { url?: string; content?: string }).content = content;
                        }
                    } catch (fetchError: any) {
                         console.error(`Error fetching content for ${policyType} (${policyInfo.url}): ${fetchError.message}`);
                         if (data.pageContent[policyType]) {
                            (data.pageContent[policyType] as { url?: string; content?: string }).content = `Error fetching content: ${fetchError.message}`;
                         }
                    }
                }
            };

            await processPolicy('privacyPolicy');
            await processPolicy('termsOfService');
            await processPolicy('usageAgreement');
            await processPolicy('returnPolicy');
            await processPolicy('exchangePolicy');

            for (const key in data.pageContent.other) {
                const policy = data.pageContent.other[key];
                if (policy.url) {
                    policyFetches.push(
                        fetchPolicyContent(policy.url)
                            .then(content => { data.pageContent.other[key].content = content; })
                            .catch(fetchError => {
                                console.error(`Error fetching content for other policy ${key} (${policy.url}): ${fetchError.message}`);
                                data.pageContent.other[key].content = `Error fetching content: ${fetchError.message}`;
                            })
                    );
                }
            }

            if (policyFetches.length > 0) {
              await Promise.all(policyFetches);
            }
          }

          return new Response(JSON.stringify(data, null, 2), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error: any) {
          const errorMessage = error?.message || 'Unknown error';
          console.error(`Scraping failed: ${errorMessage}`);
          return new Response(JSON.stringify({ error: `Scraping failed: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

      default:
        const instructions = {
          message: 'Welcome to the Website Scraper API',
          apiEndpoint: `${url.origin}/api/scrape`,
          usage: `GET ${url.origin}/api/scrape?url=<URL_TO_SCRAPE>`,
          parameters: {
              url: 'Required. The full URL (including http/https) of the website to scrape.',
              fetchContent: 'Optional. Set to "true" to fetch the content of detected policy pages (can increase processing time).'
          },
          example: `${url.origin}/api/scrape?url=https://example.com&fetchContent=true`,
          features: {
            metadata: "Extracts page metadata like title, description, and Open Graph tags",
            colors: "Detects dominant colors used on the website",
            socialLinks: "Finds links to social media profiles",
            policyPages: "Locates privacy policy, terms of service, and other legal pages",
            taxInformation: "Extracts tax identification numbers and tax registration certificate images"
          }
        };

        return new Response(JSON.stringify(instructions, null, 2), {
          status: url.pathname === '/' ? 200 : 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
    }
  },
} as ExportedHandler<Env>;
