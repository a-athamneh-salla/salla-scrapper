# Website Scraper

A powerful web scraper built with Cloudflare Workers that extracts valuable information from websites including metadata, color palette, social media links, and important policy pages.

## Features

- **Metadata Extraction**: Title, description, keywords, author, favicon, Open Graph tags, Twitter Card tags
- **Color Palette Detection**: Extracts colors from CSS (hex, RGB, RGBA, and named colors)
- **Social Media Links**: Detects links to major platforms (Facebook, Twitter, Instagram, LinkedIn, etc.)
- **Policy Page Detection**: Finds and categorizes important policy pages:
  - Privacy Policy
  - Terms of Service
  - Usage Agreement
  - Return Policy
  - Exchange Policy
  - Other policy pages
- **Content Extraction**: Fetches and cleans the content of policy pages
- **Interactive UI**: Web interface for easy scraping and results visualization
- **CORS-Enabled API**: Can be used as a backend for other applications

## Live Demo

The scraper is running at the root URL of the application. Visit the application in your browser to access the web interface.

## API Usage

### Basic Endpoint

```
GET /api/scrape?url=https://example.com
```

This endpoint accepts a URL parameter and returns a JSON object with the extracted data.

### With Content Fetching

```
GET /api/scrape?url=https://example.com&fetchContent=true
```

Adding the `fetchContent=true` parameter will also fetch and extract the content of detected policy pages.

### Response Format

```json
{
  "url": "https://example.com",
  "metadata": {
    "title": "Example Website",
    "description": "This is an example website",
    "keywords": "example, website, test",
    "author": "Example Author",
    "favicon": "https://example.com/favicon.ico",
    "ogTags": {
      "title": "Example Website",
      "description": "This is an example website",
      "image": "https://example.com/image.jpg"
    },
    "twitterTags": {
      "card": "summary",
      "title": "Example Website",
      "description": "This is an example website"
    }
  },
  "colors": [
    "#ff0000",
    "#00ff00",
    "blue",
    "rgb(255, 0, 0)"
  ],
  "socialMediaLinks": {
    "facebook": "https://facebook.com/example",
    "twitter": "https://twitter.com/example",
    "instagram": "https://instagram.com/example",
    "other": {
      "example.com": "https://example.com/social"
    }
  },
  "pageContent": {
    "privacyPolicy": {
      "url": "https://example.com/privacy",
      "content": "Privacy policy content here..."
    },
    "termsOfService": {
      "url": "https://example.com/terms",
      "content": "Terms of service content here..."
    },
    "returnPolicy": {
      "url": "https://example.com/returns",
      "content": "Return policy content here..."
    },
    "exchangePolicy": {
      "url": "https://example.com/exchange",
      "content": "Exchange policy content here..."
    },
    "other": {
      "cookie-policy": {
        "url": "https://example.com/cookies",
        "content": "Cookie policy content here..."
      }
    }
  }
}
```

## Web UI

The web interface provides an easy way to use the scraper:

1. Enter the URL of the website to scrape
2. Choose whether to fetch the content of policy pages
3. Click "Scrape Website"
4. View the results organized in tabs:
   - Metadata
   - Colors
   - Social Media Links
   - Policy Pages
   - Raw JSON

## Technical Details

### Implementation

The scraper is implemented as a Cloudflare Worker using the following technologies:

- **Cloudflare Workers**: Serverless platform for the backend
- **Cheerio**: Library for HTML parsing and manipulation
- **TypeScript**: For type-safe code

### Key Components

- **Metadata Extraction**: Uses meta tags, title, and link elements to extract website metadata
- **Color Detection**: Regular expressions to find colors in CSS
- **Social Media Detection**: Regex patterns and DOM analysis to find social media links
- **Policy Page Detection**: Uses URL patterns, link text, and DOM location to identify policy pages
- **Content Extraction**: Removes non-essential elements and cleans up the content

## Development

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Local Development

Run the development server:
```bash
npm run dev
```

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Advanced Usage

### Adding Custom Policy Pages

The scraper automatically detects common policy pages, but you can extend it to find additional types of pages by modifying the `extractPolicyPages` function in `src/index.ts`.

### Color Extraction Customization

You can adjust the color extraction to find more or fewer colors by modifying the regular expressions and the result limit in the `extractColorsFromCSS` function.

### Content Extraction Fine-tuning

The content extraction can be fine-tuned by modifying the selectors and cleanup process in the `fetchPolicyContent` function.

## License

MIT License

## Author

Created for web data extraction and analysis.# salla-scrapper
