(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const card = document.getElementById('login-card');
  const errEl = document.getElementById('login-err');
  const submitBtn = document.getElementById('submit');
  const submitLabel = submitBtn.querySelector('.label');
  const spinner = submitBtn.querySelector('.spinner');

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    card.classList.remove('shake');
    // 触发 reflow 让动画重新播放
    void card.offsetWidth;
    card.classList.add('shake');
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitLabel.hidden = loading;
    spinner.hidden = !loading;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) {
      showError('请输入用户名和密码');
      return;
    }
    errEl.hidden = true;
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        // 登录成功，跳转 dashboard。location.replace 不留 history 项
        location.replace('/dashboard/');
        return;
      }
      let msg = '登录失败';
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch { /* ignore */ }
      showError(msg);
    } catch (err) {
      showError('网络错误：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener('submit', onSubmit);
})();
