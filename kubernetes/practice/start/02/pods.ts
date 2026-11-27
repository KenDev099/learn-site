// 第 2 課測試共用：等一個 Pod 變成 Ready；容器一出現「不會自己好」的狀態就馬上停下來並說明原因
import { freshNamespace, kube, kubeJson, podSummary, sleep, waitFor } from '../../helpers/k8s.ts'

const HINTS: Record<string, string> = {
  ErrImagePull: '節點拉不到映像：tag 寫對了嗎？imagePullPolicy 是 Always（或 tag 是 latest、沒寫 tag）時 kubelet 一定去 registry 拉',
  ImagePullBackOff: '節點拉不到映像，正在等下一次重試：tag 寫對了嗎？imagePullPolicy 是 Always（或 tag 是 latest、沒寫 tag）時 kubelet 一定去 registry 拉',
  ErrImageNeverPull: 'imagePullPolicy 是 Never，但節點上沒有這個映像',
  InvalidImageName: '映像名稱的格式不對',
  CreateContainerConfigError: '容器的設定有問題（例如引用了不存在的 ConfigMap）',
  CrashLoopBackOff: '容器一啟動就結束、一直被重開：用 kubectl logs <Pod> --previous 看它結束前印了什麼',
}

export async function waitPodReady(ns: string, name: string, timeoutMs: number): Promise<any> {
  const end = Date.now() + timeoutMs
  let pod: any
  for (;;) {
    try { pod = kubeJson('get', 'pod', name, '-n', ns) } catch { pod = undefined }
    if (pod) {
      if (pod.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True')) return pod
      for (const c of [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])]) {
        const reason = c.state?.waiting?.reason
        if (reason && HINTS[reason]) throw new Error(`容器 ${c.name} 停在 ${reason}：${HINTS[reason]}。\n用 kubectl describe pod ${name} -n ${ns} 看最下面的 Events`)
        // 一般 init container 正常結束（exit 0）是預期的；其他容器結束過，或 init container 失敗，都不會自己好
        const init = (pod.spec.initContainers ?? []).some((i: any) => i.name === c.name && i.restartPolicy !== 'Always')
        const t = init ? (c.state?.terminated?.exitCode ? c.state.terminated : c.lastState?.terminated) : c.state?.terminated ?? c.lastState?.terminated
        if (t) throw new Error(`容器 ${c.name} 啟動後就結束了（exit code ${t.exitCode}，重啟 ${c.restartCount ?? 0} 次）：用 kubectl logs ${name} -n ${ns} -c ${c.name} --previous 看它印了什麼`)
      }
      if (pod.status?.phase === 'Failed' || pod.status?.phase === 'Succeeded')
        throw new Error(`Pod 已經結束（phase ${pod.status.phase}），不會再啟動：${podSummary([pod])}`)
    }
    if (Date.now() > end) throw new Error(`Pod ${name} 沒有在 ${Math.round(timeoutMs / 1000)} 秒內 Ready：${pod ? podSummary([pod]) : '找不到這個 Pod'}\n用 kubectl describe pod ${name} -n ${ns} 看最下面的 Events`)
    await sleep(2000)
  }
}

// 叢集忙的時候，上一次的 namespace 可能要超過 2 分鐘才刪完；建好之後 default ServiceAccount 也要等控制器建立，Pod 才建得起來
export async function freshPodNamespace(ns: string) {
  kube('delete', 'namespace', ns, '--ignore-not-found', '--wait=false')
  await waitFor(() => kube('get', 'namespace', ns).code !== 0, 300_000, `上一次的 namespace ${ns} 一直刪不掉：用 kubectl get namespace ${ns} -o yaml 看 status`, 2000)
  freshNamespace(ns)
  await waitFor(() => kube('get', 'serviceaccount', 'default', '-n', ns).code === 0, 180_000, `namespace ${ns} 的 default ServiceAccount 一直沒建立（叢集很忙時 controller-manager 會慢；用 kubectl get pods -n kube-system 看它是否在重啟）`, 1000)
}
