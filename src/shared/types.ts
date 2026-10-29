/**
 * 前后端共用的类型定义（仅类型，不产生运行时产物）。
 */

export type IssueLevel = 'error' | 'warn';

/** 一条校验结果。code 见 AGENTS.md「校验错误码」。 */
export interface LintIssue {
  level: IssueLevel;
  code: string;
  message: string;
  /** 相对项目根目录的路径，如 designs/echoes/screens/main-menu.svg */
  file: string;
  /** 1 基行号 */
  line?: number;
}

/** 从设计稿中提取出的一条语义标注（data-role / aria-label / data-action）。 */
export interface Annotation {
  tag: string;
  role?: string;
  label?: string;
  action?: string;
  state?: string;
  line: number;
}

/** 项目：public/designs/<id>/，带一份 project.json。 */
export interface ProjectEntry {
  kind: 'project';
  /** 目录名，等于 URL 里的 project 参数 */
  id: string;
  name: string;
  description: string;
  path: string;
  updatedAt: string;
  designCount: number;
  /** 项目素材库 designs/<id>/assets/ 下的素材数 */
  assetCount: number;
}

/** 设计稿条目：目录页的一张卡片、抽屉里树的一个叶子。 */
export interface DesignEntry {
  kind: 'design';
  /** 项目内相对路径（无扩展名），如 screens/main-menu */
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  description: string;
  /** 项目下的分类目录名，直接放在项目根时为「未分类」 */
  category: string;
  viewBox: string;
  width: number;
  height: number;
  tags: string[];
  /** 站内绝对路径，如 /designs/echoes/screens/main-menu.svg */
  file: string;
  /** 相对项目根目录的路径，供 /api/design 使用 */
  path: string;
  updatedAt: string;
  annotationCount: number;
  issues: LintIssue[];
}

/**
 * 素材条目。
 * scope = 'global' 表示 public/assets/ 下的全局共享素材；
 * scope = 项目 id 表示 public/designs/<项目>/assets/ 下的项目私有素材。
 */
export interface AssetEntry {
  kind: 'asset';
  id: string;
  name: string;
  ext: string;
  bytes: number;
  file: string;
  path: string;
  updatedAt: string;
  /** 'global' 或项目目录名 */
  scope: string;
}

export interface Manifest {
  generatedAt: string;
  projects: ProjectEntry[];
  designs: DesignEntry[];
  assets: AssetEntry[];
}

/** GET /api/design?file=... 的响应 */
export interface DesignDetail {
  entry: DesignEntry;
  annotations: Annotation[];
  issues: LintIssue[];
}
