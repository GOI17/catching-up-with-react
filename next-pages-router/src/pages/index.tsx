import { InferGetServerSidePropsType } from "next";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";

export default function Page({
  breeds,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [name, setName] = useState<string | null>(null);
  const [petImage, setPetImage] = useState<string | null>(null);

  const handleOnSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    fetch(`https://dog.ceo/api/breed/${formData.get("breed")}/images/random`)
      .then((res) => res.json())
      .then((res) => setPetImage(res.message));
  };

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => {
        if (!res.ok) {
          throw new Error();
        }

        return res.json() as unknown as { name: string };
      })
      .then(({ name }) => {
        setName(name);
      });
  }, []);

  return (
    <main>
      <p>Hello, {name}</p>
      <section>
        <form onSubmit={handleOnSubmit}>
          <select required name="breed">
            <option disabled>Choose your breed</option>
            {Object.entries(breeds).map(([breed, options]) => {
              return <option key={breed}>{breed}</option>;
            })}
          </select>
          <button type="submit">Get me a picture!</button>
        </form>
      </section>
      <section>
        {petImage ? (
          <Image alt="Dog image" src={petImage} width={250} height={250} />
        ) : null}
      </section>
    </main>
  );
}

export const getServerSideProps = async () => {
  const breeds = await fetch("https://dog.ceo/api/breeds/list/all")
    .then((res) => res.json())
    .then((res) => res.message);

  return {
    props: {
      breeds,
    } as { breeds: Record<string, []> },
  };
};
