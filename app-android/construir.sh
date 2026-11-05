#!/bin/bash
# Gera o APK do app do painel (app-android/). Uso: ANDROID_SDK=<pasta do SDK> CHAVE=<keystore .jks> SENHA=<senha> ./construir.sh
# Precisa do SDK com "platforms;android-34" e "build-tools;34.0.0" (sdkmanager). Sem Gradle: aapt2 + javac + d8 + apksigner.
# A chave de assinatura NÃO fica no repositório. Para atualizar o app no celular sem desinstalar, use sempre a mesma chave.
set -e
cd "$(dirname "$0")"
BT="$ANDROID_SDK/build-tools/34.0.0"; JAR="$ANDROID_SDK/platforms/android-34/android.jar"
VERSAO_CODIGO="${VERSAO_CODIGO:-1}"; VERSAO_NOME="${VERSAO_NOME:-1.0}"
rm -rf saida && mkdir -p saida/gen saida/classes
"$BT/aapt2" compile --dir res -o saida/res.zip
"$BT/aapt2" link -o saida/base.apk -I "$JAR" --manifest AndroidManifest.xml --java saida/gen saida/res.zip \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSAO_CODIGO" --version-name "$VERSAO_NOME"
javac -nowarn -source 8 -target 8 -classpath "$JAR" -d saida/classes $(find src saida/gen -name '*.java') 2>&1 | grep -v "^warning\|^Note" || true
"$BT/d8" --lib "$JAR" --min-api 24 --output saida $(find saida/classes -name '*.class')
cp saida/base.apk saida/sem-assinatura.apk
(cd saida && zip -q -j sem-assinatura.apk classes.dex)
"$BT/zipalign" -f -p 4 saida/sem-assinatura.apk saida/alinhado.apk
"$BT/apksigner" sign --ks "$CHAVE" --ks-pass "pass:$SENHA" --out saida/painel-vpc.apk saida/alinhado.apk
"$BT/apksigner" verify saida/painel-vpc.apk && echo "APK: $(pwd)/saida/painel-vpc.apk"
