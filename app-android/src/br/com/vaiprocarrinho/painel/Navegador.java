package br.com.vaiprocarrinho.painel;

// Páginas http(s) (painel e login do Cloudflare Access) abrem dentro do app; outros links (mailto:, apps) abrem fora
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class Navegador extends WebViewClient {
    private final Activity tela;

    public Navegador(Activity tela) {
        this.tela = tela;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest pedido) {
        Uri u = pedido.getUrl();
        String esquema = u.getScheme();
        if ("https".equals(esquema) || "http".equals(esquema)) return false;
        try {
            tela.startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
            // nenhum app abre esse link: ignora
        }
        return true;
    }
}
