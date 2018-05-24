import { h, app } from '../src/index'
import 'animate.css';
import './main.css';

const actions = {
  up: value => state => ({ count: state.count + value }),
  reserve: () => ({ list: [2, 3, 1] }),
  reserve2: () => ({ list2: [{ key: 1, value: 3 }, { key: 2, value: 1 }, { key: 3, value: 2 }] })
}

const state = {
  count: 1,
  title: 'ABC',
  list: [1, 2, 3],
  list2: [{ key: 2, value: 1 }, { key: 1, value: 2 }, { key: 3, value: 3 }]
}

const Header = ({ title }) => (
  <h1>{title}</h1>
)

const View = (state, actions) => (
  <div>
    <Header title={state.title} />
    <h1>{state.count}</h1>
    <button onclick={() => actions.up(1)}>+</button>
    <div class="flex-box">
      <div>
        <p>diff的情况1</p>
        <ul>
          {state.list.map(item => (
            <li class="animated rotateIn" key={item}>{item}</li>
          ))}
        </ul>
        <button onclick={actions.reserve}>reserve</button>
      </div>
      <div>
        <p>乱序key</p>
        <ul>
          {state.list2.map(item => (
            <li class="animated rotateIn" key={item.key}>{item.value}</li>
          ))}
        </ul>
        <button onclick={actions.reserve2}>reserve2</button>
      </div>
      <div>
        <p>diff的情况1</p>
        <ul>
          {state.list2.map(item => (
            <li class="animated rotateIn" key={item.key}>{item.value}</li>
          ))}
        </ul>
        <button onclick={actions.reserve2}>reserve2</button>
      </div>
    </div>

  </div>
)

app(state, actions, View, document.body);
