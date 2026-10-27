<template>
  <section aria-labelledby="not-found-title">
    <v-card class="pa-6 pa-sm-10" rounded="xl" elevation="0" border>
      <p class="text-overline text-primary mb-4">404</p>
      <h1 id="not-found-title" class="text-h5 font-weight-bold mb-5">ページが見つかりません</h1>
      <p class="page-description mb-6">URLを確認するか、ホームに戻ってください。</p>
      <v-btn :to="{ name: 'home' }" color="primary" size="large" flat>ホームに戻る</v-btn>
    </v-card>
  </section>
</template>
