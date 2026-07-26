/**
 * LD-206 Global Privacy Control.
 *
 * Reporting who tracks someone while not signalling their opt-out would be
 * incoherent: the extension would be documenting collection it could have
 * objected to. So tier 1 attaches `Sec-GPC: 1` to outgoing requests.
 *
 * This uses declarativeNetRequest, which means the rule is declared to the
 * browser and the browser applies it. The extension never sees the requests,
 * which is the point: it can assert a legal preference without gaining the
 * ability to watch traffic.
 *
 * The rule id is fixed so enabling twice replaces rather than accumulates.
 */

const GPC_RULE_ID = 1

const GPC_RULE = {
  id: GPC_RULE_ID,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [{ header: 'Sec-GPC', operation: 'set', value: '1' }],
  },
  condition: {
    urlFilter: '*',
    resourceTypes: [
      'main_frame',
      'sub_frame',
      'xmlhttprequest',
      'script',
      'image',
      'stylesheet',
      'font',
      'media',
      'ping',
      'other',
    ],
  },
}

export async function enableGpc() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return false
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GPC_RULE_ID],
    addRules: [GPC_RULE],
  })
  return true
}

export async function disableGpc() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return false
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GPC_RULE_ID],
    addRules: [],
  })
  return true
}

export async function isGpcActive() {
  if (!chrome.declarativeNetRequest?.getDynamicRules) return false
  const rules = await chrome.declarativeNetRequest.getDynamicRules()
  return rules.some((rule) => rule.id === GPC_RULE_ID)
}

export { GPC_RULE_ID, GPC_RULE }
