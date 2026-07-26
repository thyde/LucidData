/**
 * LD-205 export sources.
 *
 * Which downloads count as a data export, and how to ask for one.
 *
 * Each source names the LD-203 adapter that reads its output. That link is
 * checked by a test rather than left as a comment, because a walkthrough that
 * talks someone through a multi-hour export request and then cannot read the
 * file is worse than not offering the walkthrough at all.
 */

export const EXPORT_SOURCES = [
  {
    id: 'google-takeout',
    label: 'Google Takeout',
    adapterId: 'google-takeout',
    fileTypes: ['.json'],
    requestUrl: 'https://takeout.google.com/',
    urlPatterns: ['takeout.google.com', 'takeout-download'],
    filenamePatterns: ['takeout'],
    steps: [
      'Open Google Takeout and choose Deselect all.',
      'Pick only the products you actually want in your vault.',
      'Choose a one-off export, .zip, and the largest file size offered.',
      'Google emails you when the export is ready. That can take hours.',
      'Unzip it and open the .json file for the product you want.',
    ],
  },
  {
    id: 'apple-health',
    label: 'Apple Health',
    adapterId: 'apple-health',
    fileTypes: ['.xml'],
    requestUrl: 'https://privacy.apple.com/',
    urlPatterns: ['privacy.apple.com'],
    filenamePatterns: ['apple', 'health', 'export.zip'],
    steps: [
      'On iPhone, open Health, tap your picture, then Export All Health Data.',
      'Save the export to Files or send it to this computer.',
      'Unzip it and open export.xml. It is large, and only the first records are read.',
    ],
  },
  {
    id: 'bank-csv',
    label: 'Bank statement export',
    adapterId: 'bank-csv',
    fileTypes: ['.csv'],
    requestUrl: null,
    urlPatterns: [],
    filenamePatterns: ['statement', 'transactions', 'activity'],
    steps: [
      'Sign in to your bank and find the statements or activity page.',
      'Choose CSV rather than PDF. A PDF cannot be read into structured fields.',
      'Pick the widest date range offered.',
      'Download it here and this extension will offer to hand it over.',
    ],
  },
]

const EXPORT_EXTENSIONS = ['.zip', '.json', '.csv', '.tsv', '.xml']

/**
 * Decide whether a finished download looks like a data export.
 *
 * Deliberately conservative. A false positive means offering to import a
 * holiday photo, which is noise; and matching on the URL host rather than the
 * whole URL keeps query strings out of anything that gets stored.
 */
export function matchExportSource(url, filename) {
  const lowerName = (filename ?? '').toLowerCase()
  if (!EXPORT_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) return null

  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    host = ''
  }

  for (const source of EXPORT_SOURCES) {
    if (source.urlPatterns.some((pattern) => host.includes(pattern))) return source
  }

  const base = lowerName.split(/[\\/]/).pop() ?? ''
  for (const source of EXPORT_SOURCES) {
    if (source.filenamePatterns.some((pattern) => base.includes(pattern))) return source
  }

  return null
}
