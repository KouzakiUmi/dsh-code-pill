/**
 * dsh-code-pill — host half.
 *
 * 纯浏览器侧插件：所有渲染逻辑在 ./client（lib/client.js）。主机侧只
 * 提供 composition 行（cordis.patch.yml 的 insert），没有路由、服务或
 * 配置——apply 是刻意的空操作，保持插件在 host 侧零副作用。
 */

/** Cordis 插件名。 */
export const name = 'code-pill'

/**
 * Host 侧无副作用。
 * @param ctx - host plugin context（未使用；签名与 cordis 插件约定一致）。
 */
export function apply(ctx) {}
