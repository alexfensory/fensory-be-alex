export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Remove special characters
    .replace(/[^\w\s-]/g, '')
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-|-$/g, '')
    // Limit length
    .slice(0, 100)
}

export function generateUniqueSlug(title: string, existingSlugs: string[]): string {
  let slug = generateSlug(title)
  let counter = 1

  while (existingSlugs.includes(slug)) {
    slug = `${generateSlug(title)}-${counter}`
    counter++
  }

  return slug
}
