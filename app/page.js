export default function Home() {
  return (
    <main style={{fontFamily:"sans-serif",maxWidth:720,margin:"60px auto",padding:"2rem"}}>
      <h1>Mautic ChatGPT Bridge</h1>
      <p>Ponte segura para integração OAuth com o Mautic.</p>
      <p>
        <a href="/api/oauth/start" style={{display:"inline-block",padding:"12px 18px",background:"#111",color:"#fff",textDecoration:"none",borderRadius:8}}>
          Autorizar acesso ao Mautic
        </a>
      </p>
      <p style={{fontSize:14,color:"#666"}}>As credenciais ficam armazenadas nas variáveis protegidas da Vercel e não são expostas nesta página.</p>
    </main>
  );
}
