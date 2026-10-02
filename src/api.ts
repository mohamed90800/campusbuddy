export type Status = 'Reported' | 'Assigned' | 'In progress' | 'Resolved'
export type Category = 'Wi-Fi' | 'Water' | 'Electricity' | 'Classroom' | 'Restroom' | 'Canteen' | 'Accessibility'
export type Priority = 'High' | 'Medium' | 'Low'

export type Issue = {
  id: string
  title: string
  description: string
  category: Category
  location: string
  status: Status
  priority: Priority
  supporters: number
  createdAt: string
  reportedBy: string
  department: string
  image?: string
}

export type IssueDraft = Omit<Issue, 'id' | 'status' | 'supporters' | 'createdAt'>
export type CampusConfig = { collegeName: string }

const voterStorageKey = 'campusbuddy.voter.v1'

function getVoterId(): string {
  try {
    let voterId = localStorage.getItem(voterStorageKey)
    if (!voterId) {
      voterId = crypto.randomUUID()
      localStorage.setItem(voterStorageKey, voterId)
    }
    return voterId
  } catch {
    return crypto.randomUUID()
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options.headers },
  })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`)
  return result
}

export function fetchCampusConfig() {
  return request<CampusConfig>('/api/config')
}

export function fetchIssues() {
  return request<Issue[]>('/api/issues')
}

export async function fetchVotedIssueIds() {
  const voterId = encodeURIComponent(getVoterId())
  const result = await request<{ issueIds: string[] }>(`/api/votes?voterId=${voterId}`)
  return result.issueIds
}

export function createIssue(issue: IssueDraft) {
  return request<Issue>('/api/issues', { method: 'POST', body: JSON.stringify(issue) })
}

export function toggleIssueVote(issueId: string) {
  return request<Issue>(`/api/issues/${issueId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ voterId: getVoterId() }),
  })
}

export function setIssueStatus(issueId: string, status: Status) {
  return request<Issue>(`/api/issues/${issueId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function signInAdmin(password: string) {
  return request<{ ok: true }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) })
}

export function signOutAdmin() {
  return request<{ ok: true }>('/api/admin/logout', { method: 'POST' })
}
