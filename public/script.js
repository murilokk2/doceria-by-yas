let carrinho = [];function adicionarProduto(){
    const produtoTexto = produto.options[produto.selectedIndex].text;
    const preco = Number(produto.value);
    const qtd = Number(quantidade.value);
    const subtotal = preco * qtd;

    carrinho.push({
        produto: produtoTexto,
        quantidade: qtd,
        subtotal: subtotal
    });

    mostrarCarrinho();
    atualizarTotalCarrinho();

    produto.selectedIndex = 0;
quantidade.value = 1;
}
function mostrarCarrinho(){
    const lista = document.getElementById("listaProdutos");

    lista.innerHTML = "";

    carrinho.forEach((item, index) => {
        lista.innerHTML += `
            <li>
                ${item.quantidade}x ${item.produto.replace(/ - R\$?\d+/, "")}
                — R$ ${item.subtotal.toFixed(2).replace(".", ",")}

                <button onclick="removerProduto(${index})" class="btn-remover">
                    ❌
                </button>
            </li>
        `;
    });
}

function removerProduto(index){
    carrinho.splice(index, 1);

    mostrarCarrinho();
    atualizarTotalCarrinho();
}

function atualizarTotalCarrinho(){
    const soma = carrinho.reduce((total, item) => total + item.subtotal, 0);

    total.innerHTML = `💖 Total: R$ ${soma.toFixed(2).replace(".", ",")}`;
}

const form = document.getElementById("formEncomenda");
const produto = document.getElementById("produto");
const quantidade = document.getElementById("quantidade");
const total = document.getElementById("total");

function atualizarTotal(){
    const preco = Number(produto.value);
    const qtd = Number(quantidade.value);
    const valorFinal = preco * qtd;

    total.innerHTML = `💖 Total: R$ ${valorFinal.toFixed(2).replace(".", ",")}`;
}

produto.addEventListener("change", atualizarTotal);
quantidade.addEventListener("input", atualizarTotal);

form.addEventListener("submit", async function(e){
    e.preventDefault();

    const dados = {
        nome: document.getElementById("nome").value,
        telefone: document.getElementById("telefone").value,
        pagamento: document.getElementById("pagamento").value,
        entrega: document.getElementById("entrega").value,
        endereco: document.getElementById("endereco").value,

       produto: carrinho.map(item => `${item.quantidade}x ${item.produto}`).join(" | "),
quantidade: carrinho.reduce((total, item) => total + item.quantidade, 0),

        total: total.innerText,
        observacao: document.getElementById("observacao").value
    };

    const resposta = await fetch("/encomendar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(dados)
    });

    const resultado = await resposta.json();

    if(resultado.sucesso){
       document.getElementById("popup-sucesso").style.display = "flex";
       form.reset();

carrinho = [];
mostrarCarrinho();
atualizarTotalCarrinho();
    } else {
       alert(resultado.erro || "Erro ao enviar encomenda.");
    }
});

atualizarTotalCarrinho();

function fecharPopup(){
    document.getElementById("popup-sucesso").style.display = "none";
}