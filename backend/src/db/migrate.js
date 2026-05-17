// schema 迁移已在 db/index.js 初始化时执行；保留此文件以备 CLI/测试场景显式调用
import { db } from './index.js';

export function migrate() {
  // no-op: schema 在 db/index.js 中已 exec 过
  return db;
}
