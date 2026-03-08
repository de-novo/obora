import type { Community } from './data/seed'

export interface Post {
  id: string
  title: string
  body: string
  author: {
    id: string
    name: string
    avatar?: string
  }
  category: Community
  tags: string[]
  createdAt: string
  upvotes: number
  downvotes: number
}

export interface FilterState {
  search: string
  category: Community | null
  sortBy: 'newest' | 'popular'
  tags: string[]
}

export interface VoteState {
  postId: string
  upvotes: number
  downvotes: number
  userVote: 1 | -1 | 0
}

export interface ModalState {
  isOpen: boolean
  formData: {
    title: string
    body: string
    category: Community
    tags: string[]
  }
  errors: {
    title?: string
    body?: string
    category?: string
  }
  isSubmitting: boolean
}

export const initialFilterState: FilterState = {
  search: '',
  category: null,
  sortBy: 'newest',
  tags: [],
}

export const initialModalState: ModalState = {
  isOpen: false,
  formData: { title: '', body: '', category: 'r/startups', tags: [] },
  errors: {},
  isSubmitting: false,
}
