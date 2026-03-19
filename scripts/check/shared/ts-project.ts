import { Project, type SourceFile } from 'ts-morph'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const projectCache = new Map<string, Project>()

/**
 * Get (or create) a ts-morph Project for a given tsconfig path.
 * Cached so multiple checks reuse the same Project instance.
 */
export function getProject(tsconfigPath: string): Project {
  const absPath = resolve(tsconfigPath)

  if (projectCache.has(absPath)) {
    return projectCache.get(absPath)!
  }

  if (!existsSync(absPath)) {
    throw new Error(`tsconfig not found: ${absPath}`)
  }

  const project = new Project({
    tsConfigFilePath: absPath,
    skipAddingFilesFromTsConfig: false,
  })

  projectCache.set(absPath, project)
  return project
}

/**
 * Get source files for a package via ts-morph.
 */
export function getProjectSourceFiles(tsconfigPath: string): SourceFile[] {
  const project = getProject(tsconfigPath)
  return project.getSourceFiles()
}

/**
 * Clear the project cache (useful for testing).
 */
export function clearProjectCache(): void {
  projectCache.clear()
}
