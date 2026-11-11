import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { BOOK } from './lib/book';

// Can be imported from a shared config
const locales = ['nl', 'en'];

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  if (!locale || !locales.includes(locale)) notFound();

  const messages = (await import(`./messages/${locale}.json`)).default;
  // messages/books/<book>.<locale>.json overrides the 1926 texts per namespace.
  const overrides = BOOK.id === "1926" ? {} : (await import(`./messages/books/${BOOK.id}.${locale}.json`)).default;
  for (const [ns, values] of Object.entries(overrides)) {
    messages[ns] = { ...messages[ns], ...(values as object) };
  }
  return { locale, messages };
});
