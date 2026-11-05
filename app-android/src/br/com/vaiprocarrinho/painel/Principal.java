package br.com.vaiprocarrinho.painel;

// App do painel do Giovanni (05/11/2026): abre painel.vaiprocarrinho.com.br numa tela cheia (WebView), com o login do
// Cloudflare Access lembrado (cookies guardados), botão "voltar" do celular voltando dentro do painel e o painel
// recarregado quando o app volta depois de 10 minutos fechado. Links de fora (mailto:, outros apps) abrem fora.
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class Principal extends Activity {
    private static final String ENDERECO = "https://painel.vaiprocarrinho.com.br/";
    private static final long RECARREGAR_DEPOIS_MS = 10 * 60 * 1000;
    private WebView tela;
    private long saiuEm = 0;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        Window janela = getWindow();
        janela.setStatusBarColor(Color.parseColor("#0b0b10"));
        janela.setNavigationBarColor(Color.parseColor("#0b0b10"));

        tela = new WebView(this);
        tela.setBackgroundColor(Color.parseColor("#0b0b10"));
        WebSettings ajustes = tela.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setDatabaseEnabled(true);
        ajustes.setLoadWithOverviewMode(true);
        ajustes.setUseWideViewPort(true);
        ajustes.setUserAgentString(ajustes.getUserAgentString() + " PainelVPC/1.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(tela, true);

        tela.setWebViewClient(new Navegador(this));
        setContentView(tela);
        if (salvo != null) tela.restoreState(salvo);
        else tela.loadUrl(ENDERECO);
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        tela.saveState(estado);
    }

    @Override
    protected void onPause() {
        super.onPause();
        saiuEm = SystemClock.elapsedRealtime();
        CookieManager.getInstance().flush(); // guarda o login
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (saiuEm > 0 && SystemClock.elapsedRealtime() - saiuEm > RECARREGAR_DEPOIS_MS) tela.reload();
    }

    @Override
    public void onBackPressed() {
        if (tela.canGoBack()) tela.goBack();
        else super.onBackPressed();
    }
}
