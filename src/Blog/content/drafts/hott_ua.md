# talk about how List Bool and N are isom so we want funcs to lift

'''
from typing import List, Set, Tuple, Callable

def double(x):
    return x + x

def square(x):
    return x ** 2

def list_to_nat(l: List[tuple]):
    return len(l)

def nat_to_list(n: int):
    if n < 0:
        print(f"Passed negative int: {n}")
        return None
    else:
        return [() for _ in range(n)]



n = 3
l = [(), (), ()]
stuff = [n, l]
funcs = [double, square]

for val in stuff:
    for func in funcs:
        try:
            print(func(val))
        except:
            match val:
                case list(tuple):
                    print(nat_to_list(func(list_to_nat(val))))
                    break
                    
            print(f"Failed to run {func.__name__} on {type(val)}")
'''