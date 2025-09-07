
function reactRender(reactElement, container) {
    const createElement = document.createElement(reactElement.type)
    createElement.innerHTML = reactElement.children
    createElement.setAttribute('href',reactElement.props.href)
    createElement.setAttribute('target',reactElement.props.target)

    container.appendChild(createElement);
    
}

const reactElement = {
    type:'a',
    props:{
        href:'https://google.com',
        target:'_blank'
    },
    children:"click me to visit google"
}

const mainContainer = document.querySelector('#root')

reactRender(reactElement,mainContainer)