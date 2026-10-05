/**
 * 器魂页文案 —— 凝炼台的代价与余额、散去的不可逆,都从这一份出。
 *
 * 页面模板只许调用,不许手打(有 soulText.spec 的同源防线兜底):
 * 凝炼要掏道源,弹窗里把余额一起报出;散去一无所得,先把「不返」说在前头。
 */
export function refineCostLine(cost: number, balanceText: string): string {
  return `入炉即毁原器,耗道源 ${cost},现有道源 ${balanceText}`
}

export function dissolveNote(): string {
  return '散去不可逆:形意还天,道源不返'
}
