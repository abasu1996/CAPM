import { useState } from "react";
import "./App.css";

function App() {
  const [color, setColor] = useState("olive");
  return (
    <>
      <div
        className="w-full h-screen duration-300"
        style={{ backgroundColor: color }}
      >
        <div className="fixed flex flex-wrap justify-center bottom-12 inset-x-0 px-2">

          <div className="flex flex-wrap justify-center gap-3 shadow-lg bg-white rounded-3xl px-3 py-2">

            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-white" style={{backgroundColor:"red"}} onClick={()=>setColor('red')}>Red</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-white" style={{backgroundColor:"green"}} onClick={()=>setColor('green')}>Green</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-white" style={{backgroundColor:"blue"}} onClick={()=>setColor('blue')}>Blue</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-white" style={{backgroundColor:"olive"}} onClick={()=>setColor('olive')}>Olive</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-white" style={{backgroundColor:"yellow"}} onClick={()=>setColor('yellow')}>Yellow</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-white" style={{backgroundColor:"black"}} onClick={()=>setColor('black')}>Black</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-black" style={{backgroundColor:"white"}} onClick={()=>setColor('white')}>White</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-black" style={{backgroundColor:"gray"}} onClick={()=>setColor('gray')}>Gray</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-black" style={{backgroundColor:"pink"}} onClick={()=>setColor('pink')}>Pink</button>
            <button className="outline-none px-5 py-3 rounded-3xl shadow-lg text-black" style={{backgroundColor:"orange"}} onClick={()=>setColor('orange')}>Orange</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
