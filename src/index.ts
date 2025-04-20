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

          // Fetch the target website
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });

          // Check if the response is OK
          if (!response.ok) {
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

          // Extract site colors from stylesheets and inline styles
          let allCSS = '';
          $('style').each((_, element) => { allCSS += $(element).html() || ''; });
          $('[style]').each((_, element) => { allCSS += $(element).attr('style') || ''; });
          data.colors = extractColorsFromCSS(allCSS);

          // Extract social media links
          data.socialMediaLinks = extractSocialMediaLinks($);

          // Extract policy pages
          data.pageContent = extractPolicyPages($, targetUrl);

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
          return new Response(JSON.stringify({ error: `Scraping failed: ${error?.message || 'Unknown error'}` }), {
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
