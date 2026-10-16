/**
 * The blue "账户登录验证" dialog.
 *
 * Deliberately styled like a platform re-authentication step — blue, calm, and
 * official-looking — but it is inert browser theatre: three transcriptions of
 * 中国人能飞 plus a ten-second reCAPTCHA hold, and the page is yours again. No
 * credential, cookie, or account is ever touched, and the dialog says so.
 *
 * It blocks dismissal on purpose (Esc, clicking away, stray keys) because the
 * joke is the forced ceremony; the only way past is to do the ceremony.
 */

import { CAPTCHA_HOLD_MS, GATE_PHRASE, PHRASE_REPEATS, phraseAccepted } from './gate.js'

const STYLE = `
:host { all: initial; }
.wrap {
  position: fixed; inset: 0; z-index: 2147483650;
  display: flex; align-items: stretch; justify-content: center;
  box-sizing: border-box; padding: clamp(12px, 3vh, 34px);
  background: var(--dsh-overlay-backdrop, rgba(6, 9, 18, 0.74));
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  font-family: var(--dsh-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif);
  color: var(--dsh-color-text, #e8ecf4);
  opacity: 0; transform: scale(0.985);
  transition: opacity 160ms ease, transform 160ms ease;
}
.wrap.in { opacity: 1; transform: scale(1); }
.card {
  display: flex; flex-direction: column;
  gap: clamp(10px, 1.8vh, 20px);
  width: 100%; height: 100%; max-width: 1240px; box-sizing: border-box;
  padding: clamp(22px, 4.4vh, 52px) clamp(22px, 5vw, 68px);
  border-radius: 20px; overflow: auto;
  background:
    radial-gradient(110% 80% at 50% 0%, rgba(59, 130, 246, 0.16) 0%, transparent 60%),
    linear-gradient(180deg, #14263f 0%, #101d31 58%, #0d1728 100%);
  border: 1px solid rgba(96, 165, 250, 0.42);
  box-shadow: 0 40px 120px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(59, 130, 246, 0.22) inset;
}
.head { display: flex; flex-direction: column; gap: 2px; }
.step { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.foot { flex: none; }
.badge {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 11px; border-radius: 999px;
  background: rgba(59, 130, 246, 0.16);
  border: 1px solid rgba(96, 165, 250, 0.5);
  color: #8ec5ff; font-size: 12px; font-weight: 700; letter-spacing: .08em;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.22); }
h1 { margin: 0; font-size: clamp(26px, 4.4vh, 44px); line-height: 1.25; font-weight: 850; }
h2 { margin: 0; font-size: clamp(11px, 1.4vh, 13px); font-weight: 600; letter-spacing: .28em; text-transform: uppercase; color: #7fb3f0; }
p { margin: 0 0 clamp(8px, 1.4vh, 14px); font-size: clamp(13px, 1.7vh, 15px); line-height: 1.75; color: #b6c7dd; }
.steps { margin: 0 0 clamp(8px, 1.4vh, 16px); padding: 0; list-style: none; counter-reset: step; }
.steps li {
  position: relative; counter-increment: step;
  padding: clamp(6px, 1.1vh, 12px) 0 clamp(6px, 1.1vh, 12px) 34px; font-size: clamp(12.5px, 1.65vh, 14.5px); color: #c7d7ea;
  border-top: 1px solid rgba(96, 165, 250, 0.14);
}
.steps li:first-child { border-top: 0; }
.steps li::before {
  content: counter(step);
  position: absolute; left: 0; top: 8px;
  width: 19px; height: 19px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 700; color: #0b1728;
  background: #7fb3f0;
}
.steps li.done::before { content: "✓"; background: #5ec8a0; color: #06251a; }
.steps li.active { color: #ffffff; }
.panel {
  margin: 0 0 clamp(8px, 1.4vh, 14px); padding: clamp(14px, 2.2vh, 24px) clamp(15px, 2.4vw, 28px); border-radius: 12px;
  background: rgba(8, 18, 33, 0.72); border: 1px solid rgba(96, 165, 250, 0.26);
}
.panel.locked { opacity: .55; }
.step-two { margin: 0; }
.step-two .captcha { margin-top: clamp(6px, 1vh, 12px); }
.label { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 8px; font-size: 12.5px; color: #9fb6d0; }
.label b { color: #eaf2ff; font-weight: 600; }
.phrase {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-bottom: clamp(8px, 1.4vh, 14px); padding: clamp(10px, 1.8vh, 18px) 14px; border-radius: 10px;
  background: rgba(59, 130, 246, 0.12); border: 1px dashed rgba(96, 165, 250, 0.45);
  font-size: clamp(17px, 2.9vh, 26px); letter-spacing: .16em; color: #dcebff; font-weight: 700;
}
.phrase span { font-size: 11px; letter-spacing: 0; color: #8fb0d4; font-weight: 400; }
.progress { display: flex; gap: 6px; margin-bottom: 10px; }
.progress i {
  flex: 1; height: 4px; border-radius: 999px; background: rgba(148, 180, 214, 0.22);
}
.progress i.on { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
input {
  width: 100%; box-sizing: border-box; padding: clamp(11px, 1.9vh, 18px) 14px; border-radius: 10px;
  background: rgba(4, 12, 24, 0.85); border: 1px solid rgba(96, 165, 250, 0.4);
  color: #eaf2ff; font: inherit; font-size: clamp(15px, 2.2vh, 20px); letter-spacing: .1em;
  outline: none;
}
input:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.22); }
input:disabled { opacity: .5; }
.hintline { margin: 8px 0 0; font-size: 11.5px; color: #8fa8c6; min-height: 16px; }
.hintline.bad { color: #ff9c8a; }
.hintline.good { color: #7fe0b8; }
.captcha { display: flex; align-items: center; gap: 12px; }
.box {
  width: clamp(28px, 4.4vh, 42px); height: clamp(28px, 4.4vh, 42px); flex: none; border-radius: 7px;
  border: 1.5px solid #7fa6cd; background: rgba(235, 244, 255, 0.94);
  display: grid; place-items: center; cursor: pointer;
  font-size: clamp(15px, 2.4vh, 22px); color: #0b1728; font-weight: 800; user-select: none;
}
.box.ring { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28); }
.box.busy { cursor: progress; }
.box.ring { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.28); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
.box.ready { cursor: pointer; }
.box.done { cursor: default; background: #5ec8a0; border-color: #5ec8a0; }
.captcha .text { flex: 1; font-size: clamp(12.5px, 1.7vh, 15px); color: #c7d7ea; }
.captcha .text small { display: block; margin-top: 3px; color: #8fa8c6; font-size: 11px; }
button.primary {
  width: 100%; margin-top: 4px; padding: clamp(12px, 2vh, 18px) 16px; border-radius: 11px;
  font: inherit; font-size: clamp(13.5px, 1.8vh, 16px); font-weight: 700; color: #06131f; cursor: pointer;
  background: linear-gradient(180deg, #8ec5ff, #4f9bff);
  border: 1px solid #a9d3ff;
}
button.primary:disabled { cursor: not-allowed; color: #7d8ea3; background: #243449; border-color: #33465e; }
.prank { margin-top: 12px; font-size: 11px; color: #7f93ab; line-height: 1.6; }
`

/** The step rows the dialog walks through. */
const STEPS = [
  { id: 'phrase', text: `连续默写「中国人能飞」三遍（必须简体中文）` },
  { id: 'captcha', text: `完成人机验证（按住 10 秒）` },
]

/**
 * Build and show the gate dialog.
 * @param face - { nextAt, lastCount, onPass } control hooks.
 * @returns { isOpen, close, destroy, focus }.
 */
export function createGateOverlay(face = {}) {
  const host = document.createElement('div')
  host.setAttribute('data-dsh-american-detector', 'gate')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLE
  root.append(style)

  const wrap = document.createElement('div')
  wrap.className = 'wrap'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'true')
  const card = document.createElement('div')
  card.className = 'card'
  wrap.append(card)
  root.append(wrap)

  let done = 0
  let captcha = 'idle'
  let holdTimer = null
  let settled = false

  const lines = []
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

  const render = () => {
    const phraseDone = done >= 3
    const captchaDone = captcha === 'done'
    const rows = STEPS.map((step, index) => {
      const isDone = step.id === 'phrase' ? phraseDone : captchaDone
      const active = !isDone && (step.id === 'phrase' ? true : phraseDone)
      return `<li class="${isDone ? 'done' : active ? 'active' : ''}">${esc(step.text)}</li>`
    }).join('')

    card.innerHTML = `
      <div class="head">
        <span class="badge"><span class="dot"></span>SECURITY RE-AUTHENTICATION</span>
        <h1>账户登录验证</h1>
        <h2>Account re-authentication required</h2>
        <p>为继续使用本站，请完成本次身份核验。每 ${esc(face.nextAt ?? 4)} 轮对话触发一次，未通过前输入框保持锁定。</p>
        <ul class="steps">${rows}</ul>
      </div>
      <div class="step step-one">
      <div class="panel ${phraseDone ? '' : ''}">
        <div class="label"><b>步骤一 · 默写口令</b><span>已完成 ${done} / ${PHRASE_REPEATS}</span></div>
        <div class="phrase">${esc(GATE_PHRASE)} <span>请逐字默写，必须简体中文</span></div>
        <div class="progress">${Array.from({ length: PHRASE_REPEATS }, (_, index) => `<i class="${index < done ? 'on' : ''}"></i>`).join('')}</div>
        <input type="text" autocomplete="off" spellcheck="false" maxlength="24"
          placeholder="${phraseDone ? '已通过' : '在此输入口令，按回车提交'}"
          ${phraseDone ? 'disabled' : ''} />
        <p class="hintline" data-hint>${phraseDone ? '口令校验通过。' : '提示：不需要加标点，连续输入即可。'}</p>
      </div>
      </div>
      <div class="step step-two panel ${phraseDone && !captchaDone ? '' : 'locked'}">
        <div class="label"><b>步骤二 · 人机验证</b><span>reCAPTCHA v9</span></div>
        <div class="captcha">
          <div class="box ${captcha === 'idle' ? 'ready' : ''} ${captcha === 'hold' ? 'ring busy' : ''} ${captcha === 'done' ? 'done' : ''}"
            data-box>
            ${captcha === 'idle' ? '' : captcha === 'hold' ? '⏱' : '✓'}
          </div>
          <div class="text">
            ${captcha === 'idle' ? '我不是机器人' : captcha === 'hold' ? '按住不放，满 10 秒自动通过…' : '验证通过'}
            <small>${captcha === 'hold' ? '松开即取消并重新计时' : '受假想的安全策略保护'}</small>
          </div>
        </div>
        <p class="hintline" data-captcha-hint>${phraseDone ? '按住左侧方框 10 秒即可通过。' : '请先完成步骤一。'}</p>
      </div>
      <div class="foot">
        <button class="primary" data-pass ${phraseDone && captchaDone ? '' : 'disabled'}>
          ${phraseDone && captchaDone ? '验证通过，继续使用' : '请完成以上两步'}
        </button>
        <p class="prank">※ 这是<strong>假的</strong>“登录认证”弹窗：口令与人机验证都在本机用 JavaScript 判定，
          不联网、不发送任何数据、不修改你的账户或登录状态。完成仪式即可继续。</p>
      </div>`

    const input = card.querySelector('input')
    if (input !== null && !phraseDone) {
      input.value = lines[done] ?? ''
      window.setTimeout(() => { input.focus() }, 30)
      input.addEventListener('keydown', (event) => {
        event.stopPropagation()
        event.stopImmediatePropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          submitLine()
        }
      })
      input.addEventListener('input', () => {
        lines[done] = input.value
        const hint = card.querySelector('[data-hint]')
        if (hint !== null) {
          hint.className = 'hintline'
          hint.textContent = '提示：不需要加标点，连续输入即可。'
        }
      })
    }

    card.querySelector('[data-box]')?.addEventListener('pointerdown', onPointerDown)
    card.querySelector('[data-box]')?.addEventListener('pointerup', onPointerUp)
    card.querySelector('[data-box]')?.addEventListener('pointerleave', onPointerUp)
    card.querySelector('[data-pass]')?.addEventListener('click', pass)
  }

  /** Validate and consume the current transcription line. */
  const submitLine = () => {
    const input = card.querySelector('input')
    if (input === null) return
    const value = input.value
    const hint = card.querySelector('[data-hint]')
    if (!phraseAccepted(value)) {
      if (hint !== null) {
        hint.className = 'hintline bad'
        hint.textContent = value.trim() === ''
          ? '请输入口令后再回车。'
          : `口令不匹配，请重新默写（第 ${done + 1} 遍）。`
      }
      input.value = ''
      return
    }
    lines[done] = value
    done += 1
    render()
  }

  const onPointerDown = (event) => {
    if (done < PHRASE_REPEATS || captcha !== 'idle') return
    event.preventDefault()
    captcha = 'hold'
    render()
    window.addEventListener('pointerup', onPointerUp)
    holdTimer = window.setTimeout(() => {
      if (captcha !== 'hold') return
      captcha = 'done'
      render()
    }, CAPTCHA_HOLD_MS)
  }

  const onPointerUp = () => {
    if (captcha !== 'hold') return
    window.clearTimeout(holdTimer)
    window.removeEventListener('pointerup', onPointerUp)
    captcha = 'idle'
    render()
  }

  /** Finish the ceremony. */
  const pass = () => {
    if (settled || done < PHRASE_REPEATS || captcha !== 'done') return
    settled = true
    window.removeEventListener('pointerup', onPointerUp)
    close()
    face.onPass?.()
  }

  const close = () => {
    wrap.classList.remove('in')
    window.setTimeout(() => { host.style.display = 'none' }, 160)
    if (typeof document.activeElement?.blur === 'function') document.activeElement.blur()
  }

  render()
  document.body.append(host)
  host.style.display = 'block'
  void wrap.offsetWidth
  wrap.classList.add('in')

  return {
    isOpen: () => settled !== true && host.style.display !== 'none',
    /**
     * Whether an event came from inside this dialog.
     * @param event - the event to test (shadow-retargeting aware).
     * @returns true when the event originated in this dialog's subtree.
     */
    ownsEvent: (event) => {
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : []
      return path.some(node => node instanceof Element && node.getRootNode?.() === root)
    },
    close,
    destroy: () => {
      window.clearTimeout(holdTimer)
      window.removeEventListener('pointerup', onPointerUp)
      host.remove()
    },
    focus: () => card.querySelector('input')?.focus(),
    /** Test hooks: drive the ceremony without a pointer. */
    __test: {
      /** Submit one transcription line. */
      type: (value) => {
        const input = card.querySelector('input')
        if (input === null) return false
        input.value = value
        submitLine()
        return true
      },
      /** Complete both steps with the given phrase. */
      passWith: (value) => {
        let guard = 0
        while (done < PHRASE_REPEATS && guard < PHRASE_REPEATS + 2) {
          const input = card.querySelector('input')
          if (input === null) break
          input.value = value
          submitLine()
          guard += 1
        }
        window.clearTimeout(holdTimer)
        captcha = 'done'
        render()
      },
      /** Press the final button. */
      clickPass: pass,
      /** Current internal progress, for assertions. */
      state: () => ({ done, captcha, settled, phrase: GATE_PHRASE }),
    },
  }
}
