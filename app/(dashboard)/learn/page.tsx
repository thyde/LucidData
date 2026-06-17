import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LEARN_ARTICLES, LEARN_FAQ } from '@/lib/constants/learn-content'

export const metadata: Metadata = {
  title: 'Learning Center | LucidData',
}

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Learning Center</h1>
        <p className="mt-1 text-muted-foreground">
          Understand how your data works and how to get the most from it.
        </p>
      </div>

      <div className="space-y-6">
        {LEARN_ARTICLES.map((article) => (
          <Card key={article.slug} id={article.slug} className="scroll-mt-24">
            <CardHeader>
              <CardTitle>{article.title}</CardTitle>
              <CardDescription>{article.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {article.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-2xl font-bold">Frequently asked questions</h2>
        <div className="space-y-4">
          {LEARN_FAQ.map((item) => (
            <Card key={item.question}>
              <CardHeader>
                <CardTitle className="text-base">{item.question}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.answer}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
