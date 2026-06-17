import Link from 'next/link'
import { BookOpen, ArrowRight } from 'lucide-react'
import { LEARN_ARTICLES } from '@/lib/constants/learn-content'

export function LearnCenter() {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {LEARN_ARTICLES.slice(0, 3).map((article) => (
          <li key={article.slug}>
            <Link
              href={`/learn#${article.slug}`}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                {article.title}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/learn" className="text-sm font-medium text-primary hover:underline">
        Visit the Learning Center
      </Link>
    </div>
  )
}
