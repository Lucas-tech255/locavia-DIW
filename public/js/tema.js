// Aplica o tema antes da primeira renderização e compartilha a escolha entre páginas.
(() => {
  const chave = 'locavia-tema';
  let tema = 'dark';
  try { if (localStorage.getItem(chave) === 'light') tema = 'light'; } catch {}
  function aplicar(valor) {
    tema = valor;
    document.documentElement.dataset.bsTheme = tema;
    document.querySelectorAll('.tema-alternar').forEach(botao => {
      botao.textContent = tema === 'dark' ? '☀ Tema claro' : '☾ Tema escuro';
      botao.setAttribute('aria-label', tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
    });
  }
  aplicar(tema);
  document.addEventListener('DOMContentLoaded', () => {
    aplicar(tema);
    document.querySelectorAll('.tema-alternar').forEach(botao => {
      botao.addEventListener('click', () => {
        aplicar(tema === 'dark' ? 'light' : 'dark');
        try { localStorage.setItem(chave, tema); } catch {}
      });
    });
    document.querySelectorAll('[data-imprimir]').forEach(botao => {
      botao.addEventListener('click', () => window.print());
    });
  });
})();
