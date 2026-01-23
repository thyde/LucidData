# API Route Patterns - LucidData

Standard patterns for building API routes. All routes must follow authentication, validation, and error handling rules.

## Standard Structure

```typescript
// app/api/resource/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resourceSchema } from '@/lib/validations/resource';
import { z } from 'zod';

export async function GET(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 2. Query database (filter by user.id)
  const items = await prisma.resource.findMany({
    where: { userId: user.id },
  });
  
  // 3. Return response
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 2. Validate input
    const body = await request.json();
    const validated = resourceSchema.parse(body);
    
    // 3. Business logic (encryption, database operations)
    const item = await prisma.resource.create({
      data: {
        userId: user.id,
        ...validated,
      },
    });
    
    // 4. Create audit log
    // ... (see Security Patterns)
    
    // 5. Return response
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Dynamic Routes

```typescript
// app/api/resource/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const item = await prisma.resource.findUnique({
    where: {
      id: params.id,
      userId: user.id, // Security: ensure user owns resource
    },
  });
  
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  return NextResponse.json(item);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Verify ownership before updating
    const existing = await prisma.resource.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    const body = await request.json();
    const validated = updateResourceSchema.parse(body);
    
    const item = await prisma.resource.update({
      where: { id: params.id },
      data: validated,
    });
    
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Verify ownership before deleting
    const item = await prisma.resource.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    
    if (!item || item.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    await prisma.resource.delete({
      where: { id: params.id },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Route Checklist

When building an API route, ensure:

✅ **Authentication (First)**
- Always call `getUser()` first
- Return 401 if user doesn't exist
- Use `user.id` for all operations

✅ **Input Validation**
- Use Zod schema `.parse()` (throws on error)
- Catch `ZodError` separately for 400 response
- Return validation errors in `details` field

✅ **Query Security**
- Filter by `userId` on all queries
- Verify ownership in dynamic routes before returning data
- Use `findUnique` with `userId` compound key when possible

✅ **Sensitive Operations**
- Create audit logs for create, update, delete operations
- Include `previousHash` in audit logs
- Log operation details (what, who, when)

✅ **Error Handling**
- Don't expose internal error details to client
- Log full error details server-side
- Return appropriate HTTP status codes:
  - 200: Success (GET, PATCH)
  - 201: Created (POST)
  - 400: Validation error
  - 401: Unauthorized
  - 404: Not found
  - 500: Server error

✅ **Response Format**
- Return JSON with consistent structure
- Use `NextResponse.json()` for all responses
- Include status code in NextResponse

---

## Zod Validation

**Always validate API inputs with Zod schemas from `lib/validations/`:**

```typescript
// lib/validations/vault.ts
import { z } from 'zod';

export const vaultDataSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100),
  category: z.enum(['personal', 'health', 'financial', 'credentials', 'other']),
  tags: z.array(z.string()).default([]),
  data: z.record(z.any()), // Flexible JSON object
  schemaType: z.string().optional(),
  schemaVersion: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export type VaultDataInput = z.infer<typeof vaultDataSchema>;

// Partial schema for updates
export const updateVaultDataSchema = vaultDataSchema.partial();
export type UpdateVaultDataInput = z.infer<typeof updateVaultDataSchema>;
```

**Usage in API routes:**

```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // .parse() throws ZodError on invalid input
    const validated = vaultDataSchema.parse(body);
    
    // validated is now type-safe VaultDataInput
    // proceed with business logic
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    // Handle other errors
  }
}
```

**Rules:**
- Create schemas in `lib/validations/`
- Use `.parse()` in API routes (throws on error)
- Use `.safeParse()` in UI forms (returns result object, no throw)
- Export TypeScript types with `z.infer<typeof schema>`
- Use `.partial()` for update schemas (make all fields optional)

---

## Common Patterns

### List with Pagination

```typescript
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') ?? '1');
  const limit = parseInt(url.searchParams.get('limit') ?? '10');
  const skip = (page - 1) * limit;
  
  const [items, total] = await Promise.all([
    prisma.resource.findMany({
      where: { userId: user.id },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.resource.count({
      where: { userId: user.id },
    }),
  ]);
  
  return NextResponse.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
```

### Filter & Search

```typescript
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  
  const items = await prisma.vaultData.findMany({
    where: {
      userId: user.id,
      ...(category && { category }),
      ...(search && {
        OR: [
          { label: { contains: search, mode: 'insensitive' } },
          { tags: { hasSome: [search] } },
        ],
      }),
    },
    orderBy: { createdAt: 'desc' },
  });
  
  return NextResponse.json(items);
}
```

---

## HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|------------|
| 200 | OK | GET or PATCH success |
| 201 | Created | POST success (new resource created) |
| 204 | No Content | DELETE success (optional, use 200 instead) |
| 400 | Bad Request | Validation error (malformed input) |
| 401 | Unauthorized | No auth or invalid token |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist or user doesn't own it |
| 409 | Conflict | Resource already exists (unique constraint) |
| 500 | Server Error | Unexpected exception |

Always return the correct status code so clients can handle responses appropriately.
