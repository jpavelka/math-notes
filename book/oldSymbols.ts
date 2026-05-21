<script>
    import DefinitionRef from "$lib/DefinitionRef.svelte";
    import Heading from "$lib/Heading.svelte";
    import MathDisp from "$lib/MathDisp.svelte";
    import Symbol from "$lib/Symbol.svelte";
</script>
<Heading refId=symbols level=1 includeDispSecNum={false}>Symbols</Heading>
<Symbol refId=setNotation searchStr={'{}'}>
    $$\{\cdots\}$$
    <span slot=desc>
        Set notation. Items inside the curly brackets are the elements of the set, so $$\{0,1\}$$ is the 2-element set consisting of just the numbers 0 and 1.
    </span>
</Symbol>
<Symbol refId=setInclusion searchStr={'in,e'}>
    $$\in$$
    <span slot=desc>
        Set inclusion. When we write $$x\in S$$, we mean that $$x$$ is an element of the set $$S$$. For example, we could write $$\pi\in\R$$, meaning the number $$\pi$$ is a real number.
    </span>
</Symbol>
<Symbol refId=setExclusion searchStr={'not,in,notin,e'}>
    $$\not\in$$
    <span slot=desc>
        Set exclusion. When we write $$x\not\in S$$, we mean that $$x$$ is <em>not</em> an element of the set $$S$$.
    </span>
</Symbol>
<Symbol refId=subseteq searchStr={'subseteq,c'}>
    $$\subseteq$$
    <span slot=desc>
        Subset. For two sets $$S, S'$$, we say $$S'\subseteq S$$ (said "$$S'$$ is a subset of $$S$$") if every element of $$S'$$ is also an element of $$S$$.
    </span>
</Symbol>
<Symbol refId=setUnion searchStr={'u,cup,union'}>
    $$\cup$$
    <span slot=desc>
        Set union. For two sets $$S, S'$$, we write $$S\cup S'$$ as the set of all elements in <em>either</em> $$S$$ or $$S'$$. When unioning a sequence of sets $$S_1,S_2,\dots,S_n$$, we may write this succinctly as $$\bigcup_{i=1}^n S_i$$.
    </span>
</Symbol>
<Symbol refId=setIntersection searchStr={'a,cap,intersection'}>
    $$\cap$$
    <span slot=desc>
        Set intersection. For two sets $$S, S'$$, we write $$S\cap S'$$ as the set of all elements in <em>both</em> $$S$$ or $$S'$$. When intersecting a sequence of sets $$S_1,S_2,\dots,S_n$$, we may write this succinctly as $$\bigcap_{i=1}^n S_i$$.    
    </span>
</Symbol>
<Symbol refId=sefDifference searchStr={'\\,difference'}>
    $$\setminus$$
    <span slot=desc>
        Set difference. For two sets $$S, S'$$, we write $$S\setminus S'$$ as the set of all elements of $$S$$ that are <em>not</em> also in $$S'$$.
    </span>
</Symbol>
<Symbol refId=reals searchStr=r,real>
    $$\R$$
    <span slot=desc>
        The set of real numbers, i.e. anything on the number line between (though not including!) $$-\infty$$ and $$\infty$$.
    </span>
</Symbol>
<Symbol refId=realNonneg searchStr={'r>=0,r\\geq0'}>
    $$\R_{\geq0}$$
    <span slot=desc>
        The set of non-negative real numbers, i.e. anything in $$\R$$ that is greater than or equal to 0.
    </span>
</Symbol>
<Symbol refId=realPos searchStr={'r>0'}>
    $$\R_{>0}$$
    <span slot=desc>
        The set of positive real numbers, i.e. anything in $$\R$$ that is strictly greater than 0.
    </span>
</Symbol>
<Symbol refId=integers searchStr=integer,z>
    $$\Z$$
    <span slot=desc>
        The set of integers, i.e. whole numbers from the set $$\R$$.
    </span>
</Symbol>
<Symbol refId=integerNonneg searchStr={'z>=0,z\\geq0'}>
    $$\Z_{\geq0}$$
    <span slot=desc>
        The set of non-negative integers, i.e. anything in $$\Z$$ that is greater than or equal to 0.
    </span>
</Symbol>
<Symbol refId=integerPos searchStr={'z>0'}>
    $$\Z_{>0}$$
    <span slot=desc>
        The set of positive integers, i.e. anything in $$\Z$$ that is strictly greater than 0.
    </span>
</Symbol>
<Symbol refId=setSize searchStr={'||,size'}>
    $$|S|$$
    <span slot=desc>
        Size of a set. This denotes the number of elements in a set, so e.g. $$|\{1,5,7,12\}|=4$$.
    </span>
</Symbol>
<Symbol refId=emptySet searchStr=emptyset,0}>
    $$\emptyset$$
    <span slot=desc>
        Empty set. A set with no elements.
    </span>
</Symbol>
<Symbol refId=forAll searchStr=a,forall>
    $$\forall$$
    <span slot=desc>
        For all. We use this symbol when we want to specify that something should be done for all elements in some set. So if we're writing out the constraints for some model and we say $$x_j\geq 0\ \forall\ j\in\{1, 2, \cdots, n\}$$ we're just saying that each of $$x_1, x_2, \cdots, x_n$$ should be non-negative.        
    </span>
</Symbol>
<Symbol refId=conditionalSet searchStr={'\{:\},conditional'}>
    $$\{x: x\textit{ satisfies some condition}\}$$
    <span slot=desc>
        Conditional set. This represents the set of all $$x$$ such that $$x$$ satisfies the condition to the right of the colon (:). For example, $$\{n\in\Z:5\leq n\leq 10\}$$ is the set of all integers between 5 and 10, i.e. $$\{5,6,7,8,9,10\}$$
    </span>
</Symbol>
<Symbol refId=setPower searchStr={'^,superscript,set,power'}>
    $$S^m$$
    <span slot=desc>
        The set of vectors with $$m$$ elements, all of which are from some set $$S$$. For example, $$\R^3$$ is the set of 3-element, real number vectors. So we could say
        <MathDisp alwaysRender={true}>
            \begin{bmatrix}1 \\ 2.64 \\ -3\end{bmatrix}\in\R^3.
        </MathDisp>
    </span>
</Symbol>
<Symbol refId=setMult searchStr=x,setmultiply>
    $$S^{m\times n}$$
    <span slot=desc>
        The set of matrices with $$m$$ rows and $$n$$ columns, whose elements are from some set $$S$$. For example, $$\Z^{m\times n}$$ is the set of $$m\times n$$ matrices whose entries are all integers. So we could say
        <MathDisp alwaysRender={true}>
            \begin{bmatrix}4 & 3 & 9 & 6\\ 0 & 4 & 8 & 5\\ 7 & 7 & 2 & 1\end{bmatrix} \in \Z^{3\times 4}.
        </MathDisp>
    </span>
</Symbol>
<Symbol refId=zeros searchStr=0,zeros>
    $$\zeros$$
    <span slot=desc>
        A matrix (or vector) with all entries equal to 0 (the size of the matrix is usually clear by context).
    </span>
</Symbol>
<Symbol refId=identityMatrix searchStr=i,identity>
    $$\identity$$
    <span slot=desc>
        A square matrix with all entries equal to 0, except the diagonal where all entries equal 1 (the size of the matrix is usually clear by context). This looks like:
        <MathDisp alwaysRender={true}>
            \begin{bmatrix}
            1 & 0 & \cdots & 0 \\
            0 & 1 & \cdots & 0 \\
            \vdots & \vdots & \ddots & \vdots \\
            0 & 0 & \cdots & 1 \\
            \end{bmatrix}
        </MathDisp>
    </span>
</Symbol>
<Symbol refId=ifAndOnlyIf searchStr={'<-,->,leftrightarrow'}>
    $$\Leftrightarrow$$
    <span slot=desc>
        If and only if. It indicates the the statement to the left is logically equivalent to the statement on the right, e.g. $$a > b \Leftrightarrow -a < -b$$.
    </span>
</Symbol>
<Symbol refId=floor searchStr=l,7,floor>
    $$\floor{x}$$
    <span slot=desc>
        The "floor" of the number $$x\in\R$$, i.e. the value resulting from rounding $$x$$ down to the nearest integer. So $$\floor{1.3}=1$$.
    </span>
</Symbol>
<Symbol refId=ceiling searchStr=l,7,ceiling>
    $$\ceil{x}$$
    <span slot=desc>
        The "ceiling" of the number $$x\in\R$$, i.e. the value resulting from rounding $$x$$ up to the nearest integer. So $$\ceil{1.3}=2$$.
    </span>
</Symbol>
<Symbol refId=lengthComplexity searchStr=l,l(x)>
    $$L(X)$$
    <span slot=desc>
        In complexity theory, $$L(X)$$ is the length of an encoding of some problem instance $$X$$.
    </span>
</Symbol>
<Symbol refId=bigO searchStr="O,big-O,bigO,big O">
    $$\O{\cdot}$$
    <span slot=desc>
        Big-O notation, for describing the long-run behavior of some function. In complexity theory, for two functions $$f,g$$ over the same domain, we say $$f(x)=\O{g(x)}$$ (in English, "$$f(x)$$ is big O of $$g(x)$$") if there exists some positive $$M\in\R_{>0}$$ and $$x_0$$ in the domain such that
        <MathDisp>
        |f(x)|\leq M|g(x)|\qquad \forall\ x\geq x_0.
        </MathDisp>
    </span>
</Symbol>
<Symbol refId=runTime searchStr="runtime,run time,running time">
    $$f_A^*(l)$$
    <span slot=desc>
        The running time of algorithm $$A$$ (on some problem $$P$$) over instances of length $$l$$.
    </span>
</Symbol>
<Symbol refId=runTime searchStr="p,class p,complexity class p">
    $$\P$$
    <span slot=desc>
        The complexity class <DefinitionRef refId=classP/>.
    </span>
</Symbol>
<Symbol refId=runTime searchStr="np,class np,complexity class np">
    $$\NP$$
    <span slot=desc>
        The complexity class <DefinitionRef refId=classNP/>.
    </span>
</Symbol>
<Symbol refId=runTime searchStr="np,class np,complexity class np">
    $$\NP$$
    <span slot=desc>
        The complexity class <DefinitionRef refId=classNP/>.
    </span>
</Symbol>
<Symbol refId=runTime searchStr="conp,class conp,complexity class conp">
    $$\coNP$$
    <span slot=desc>
        The complexity class <DefinitionRef refId=classCoNP/>.
    </span>
</Symbol>
<Symbol refId=boolAnd searchStr="and,conjunction">
    $$\land$$
    <span slot=desc>
        Boolean "and" operator (also known as conjunction).
    </span>
</Symbol>
<Symbol refId=boolOr searchStr="or,disjunction">
    $$\lor$$
    <span slot=desc>
        Boolean "or" operator (also known as disjunction).
    </span>
</Symbol>
<Symbol refId=boolNot searchStr="not,negation">
    $$\land$$
    <span slot=desc>
        Boolean "not" operator (also known as negation).
    </span>
</Symbol>