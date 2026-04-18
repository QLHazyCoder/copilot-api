import { GITHUB_API_BASE_URL, githubHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"

export async function getGitHubUser(githubToken: string) {
  const response = await fetch(`${GITHUB_API_BASE_URL}/user`, {
    headers: githubHeaders(githubToken),
  })

  if (!response.ok) throw new HTTPError("Failed to get GitHub user", response)

  return (await response.json()) as GithubUserResponse
}

// Trimmed for the sake of simplicity
export interface GithubUserResponse {
  id: number
  login: string
  avatar_url: string
}
